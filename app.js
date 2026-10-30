// ACÁ PONÉ TUS CREDENCIALES REALES
const SUPABASE_URL = 'https://nhfruepiiweznuapwfve.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VYJepoCDxfA-PVvK51Wykw_b6ZAB7jO';

const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const esAdmin = document.getElementById('admin-body') !== null;
let torneoTV = null;      
let torneoAdmin = null;   
let listaTorneos = [];
let tiradoresLocales = [];
let tiradorJuezActivoId = null;

let filtroCategoria = 'Todas';
let filtroBusqueda = '';
let modoVistaTV = 'resultados'; 
let modoTvActivo = false;

const canalRealtime = clienteSupabase.channel('sala-sincronizacion');

// RELOJ Y FECHA DINÁMICA
setInterval(() => { 
    const ahora = new Date();
    
    const elReloj = document.getElementById('reloj'); 
    if (elReloj) elReloj.innerText = ahora.toLocaleTimeString('es-AR'); 
    
    const elFecha = document.getElementById('fecha-top');
    if (elFecha) {
        let opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let fechaStr = ahora.toLocaleDateString('es-AR', opciones);
        elFecha.innerText = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
    }
}, 1000);

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && modoTvActivo) {
        document.getElementById('check-modo-tv').checked = false;
        modoTvActivo = false;
        document.getElementById('body-app').classList.remove('modo-tv-activo');
        detenerScrollAutoTV();
        if (torneoTV) cargarResultados(torneoTV.id);
    }
});

// ==========================================
// MODALES GLOBALES
// ==========================================
window.mostrarAlerta = function(msg) {
    document.getElementById('alerta-mensaje').innerText = msg;
    document.getElementById('modal-alerta').style.display = 'flex';
}
window.cerrarAlerta = function() {
    document.getElementById('modal-alerta').style.display = 'none';
}

window.mostrarConfirmacion = function(msg, onConfirm) {
    document.getElementById('confirm-mensaje').innerText = msg;
    document.getElementById('modal-confirm').style.display = 'flex';
    document.getElementById('btn-confirm-ok').onclick = function() {
        document.getElementById('modal-confirm').style.display = 'none';
        onConfirm();
    };
}
window.cerrarConfirmacion = function() {
    document.getElementById('modal-confirm').style.display = 'none';
}

// ==========================================
// SESIONES Y DATOS
// ==========================================
async function verificarSesion() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (esAdmin) {
        if (!session) window.location.href = 'index.html'; 
        else { document.getElementById('admin-body').style.display = 'block'; inicializarDatos(); }
    } else inicializarDatos(); 
}
window.abrirModalLogin = () => document.getElementById('modal-login').style.display = 'flex';
window.cerrarModalLogin = () => { document.getElementById('modal-login').style.display = 'none'; document.getElementById('login-error').style.display = 'none'; }
window.iniciarSesion = async function() {
    const { error } = await clienteSupabase.auth.signInWithPassword({ email: document.getElementById('login-email').value, password: document.getElementById('login-pass').value });
    if (error) document.getElementById('login-error').style.display = 'block'; else window.location.href = 'admin.html';
}
window.cerrarSesion = async function() { await clienteSupabase.auth.signOut(); window.location.href = 'index.html'; }

async function inicializarDatos() {
    tiradoresLocales = [];
    const { data: torneos } = await clienteSupabase.from('torneos').select('*').order('id', { ascending: true });
    listaTorneos = torneos || [];
    if (esAdmin) {
        renderizarBotonesTorneosAdmin();
        if (!torneoAdmin && listaTorneos.length > 0) seleccionarTorneoAdmin(listaTorneos[0].id);
        else if (torneoAdmin) seleccionarTorneoAdmin(torneoAdmin.id);
    } else {
        if (torneoTV) await cargarResultados(torneoTV.id);
        else renderizarTarjetasInicio();
    }
}

function renderizarTarjetasInicio() {
    const div = document.getElementById('grid-torneos-publicos');
    if (!div) return;
    div.innerHTML = '';
    if (listaTorneos.length === 0) return div.innerHTML = '<p>No hay torneos disponibles.</p>';
    listaTorneos.forEach(t => {
        let fechaFormat = t.fecha ? `<br><span style="font-size: 0.9rem; color: #888;">${t.fecha.split('-').reverse().join('/')}</span>` : '';
        div.innerHTML += `<div class="card-publica" onclick="abrirVistaTV('${t.id}')"><h3>${t.nombre}${fechaFormat}</h3><p>• ${t.platos_por_serie || 12} platos/hélices</p></div>`;
    });
}

window.abrirVistaTV = async function(id) {
    document.getElementById('vista-inicio').style.display = 'none'; document.getElementById('vista-tv').style.display = 'block';
    torneoTV = listaTorneos.find(t => t.id === id);
    if (!torneoTV.platos_por_serie) torneoTV.platos_por_serie = 12;
    document.getElementById('nombre-torneo').innerText = torneoTV.nombre;
    filtroCategoria = 'Todas'; filtroBusqueda = ''; 
    await cargarResultados(torneoTV.id);
}
window.volverAlInicio = function() {
    document.getElementById('vista-tv').style.display = 'none'; document.getElementById('vista-inicio').style.display = 'block';
    torneoTV = null; renderizarTarjetasInicio();
}

window.toggleModoTV = function() {
    modoTvActivo = document.getElementById('check-modo-tv').checked;
    const bodyEl = document.getElementById('body-app');
    
    if (modoTvActivo) {
        bodyEl.classList.add('modo-tv-activo');
        let docEl = document.documentElement;
        if (docEl.requestFullscreen) { docEl.requestFullscreen().catch(e => console.log(e)); }
        else if (docEl.webkitRequestFullscreen) { docEl.webkitRequestFullscreen(); }
        else if (docEl.msRequestFullscreen) { docEl.msRequestFullscreen(); }
        iniciarScrollAutoTV();
    } else {
        bodyEl.classList.remove('modo-tv-activo');
        detenerScrollAutoTV();
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            if (document.exitFullscreen) { document.exitFullscreen().catch(e => console.log(e)); }
            else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
            else if (document.msExitFullscreen) { document.msExitFullscreen(); }
        }
    }
    if (torneoTV) cargarResultados(torneoTV.id);
}

window.cambiarModoTV = function(modo, elementoBtn) {
    modoVistaTV = modo;
    document.querySelectorAll('.tab-btn-tv').forEach(b => b.classList.remove('active'));
    elementoBtn.classList.add('active');
    document.querySelectorAll('.modo-tv-pane').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });

    if (modo === 'resultados') {
        const pane = document.getElementById('contenedor-modo-resultados');
        pane.style.display = 'block'; pane.classList.add('active');
    } else if (modo === 'pedana') {
        const pane = document.getElementById('contenedor-modo-pedana');
        pane.style.display = 'block'; pane.classList.add('active');
    } else if (modo === 'dividido') {
        const pane = document.getElementById('contenedor-modo-dividido');
        pane.style.display = 'block'; pane.classList.add('active');
    }
    if (torneoTV) cargarResultados(torneoTV.id);
}

// ==========================================
// LÓGICA DE AUTO-SCROLL CON PAUSAS ARRIBA Y ABAJO
// ==========================================
let frameScrollTV = null;
function iniciarScrollAutoTV() {
    detenerScrollAutoTV();
    
    // Pausa inicial de 3 segundos
    document.querySelectorAll('.tbody-resto').forEach(c => {
        c.dataset.pausa = "true";
        c.dataset.scrollReal = 0;
        c.scrollTop = 0;
        setTimeout(() => { if (modoTvActivo) c.dataset.pausa = "false"; }, 3000);
    });

    function loopScroll() {
        if (!modoTvActivo) return;
        const panelesResto = document.querySelectorAll('.tbody-resto');
        panelesResto.forEach(c => {
            if (c.scrollHeight > c.clientHeight) {
                if (c.dataset.pausa === "true") return;

                let scrollReal = parseFloat(c.dataset.scrollReal || c.scrollTop);
                let maxScroll = c.scrollHeight - c.clientHeight;

                if (scrollReal >= maxScroll - 1) {
                    c.scrollTop = maxScroll; 
                    c.dataset.pausa = "true";
                    
                    setTimeout(() => { 
                        if (!modoTvActivo) return;
                        c.scrollTop = 0; 
                        c.dataset.scrollReal = 0;
                        
                        setTimeout(() => {
                            if (!modoTvActivo) return;
                            c.dataset.pausa = "false"; 
                        }, 3000); 

                    }, 3500); 
                    return;
                }
                
                scrollReal += 0.25; 
                c.dataset.scrollReal = scrollReal;
                c.scrollTop = Math.floor(scrollReal); 
            }
        });
        frameScrollTV = requestAnimationFrame(loopScroll);
    }
    loopScroll();
}
function detenerScrollAutoTV() {
    if (frameScrollTV) cancelAnimationFrame(frameScrollTV);
    document.querySelectorAll('.tbody-resto').forEach(c => {
        c.dataset.scrollReal = 0;
        c.dataset.pausa = "false";
    });
}

function renderizarBotonesTorneosAdmin() {
    const div = document.getElementById('botones-torneos');
    if (!div) return;
    div.innerHTML = '';
    listaTorneos.forEach(t => {
        div.innerHTML += `<button class="btn-torneo ${torneoAdmin && torneoAdmin.id === t.id ? 'admin-selected' : ''}" onclick="seleccionarTorneoAdmin('${t.id}')">${t.nombre}</button>`;
    });
}

window.seleccionarTorneoAdmin = async function(id) {
    torneoAdmin = listaTorneos.find(t => t.id === id);
    if (!torneoAdmin) return;
    if(!torneoAdmin.platos_por_serie) torneoAdmin.platos_por_serie = 12;
    document.getElementById('admin-torneo-titulo').innerText = `${torneoAdmin.nombre}`;
    tiradorJuezActivoId = null; 
    
    document.getElementById('edit-nombre-torneo').value = torneoAdmin.nombre;
    document.getElementById('edit-fecha-torneo').value = torneoAdmin.fecha || '';
    document.getElementById('edit-platos-torneo').value = torneoAdmin.platos_por_serie;

    cargarFormularioCostos();
    renderizarBotonesTorneosAdmin();
    await cargarResultados(torneoAdmin.id);
}

window.abrirPestana = function(idTab, elementoBtn) {
    document.querySelectorAll('.tab-pane').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(idTab).classList.add('active'); elementoBtn.classList.add('active');
}

async function cargarResultados(idTorneo) {
    if (!idTorneo) return;
    const { data } = await clienteSupabase.from('inscripciones').select('*').eq('torneo_id', idTorneo);
    if (data) {
        data.forEach(row => {
            let totalPlatos = esAdmin ? (torneoAdmin ? torneoAdmin.platos_por_serie : 12) : (torneoTV ? torneoTV.platos_por_serie : 12);
            if (!row.resultados || !Array.isArray(row.resultados)) row.resultados = Array(totalPlatos).fill(null);
            row.totalAciertos = row.resultados.filter(r => r === 1).length;
            row.totalTirados = row.resultados.filter(r => r !== null).length;
            row.barrage = row.barrage || 0;
            row.puntajeFinal = row.totalAciertos + row.barrage;
        });
        tiradoresLocales = data;
    } else tiradoresLocales = [];

    const objTorneo = esAdmin ? torneoAdmin : torneoTV;
    if (esAdmin) {
        renderizarAdminJueces(); renderizarAdminBaseDatos(); renderizarStats();
        renderizarVistaResultadosUnificada('cabecera-tabla-admin', objTorneo);
        renderizarPedana('contenedor-pedana-admin', objTorneo);
    } else if (torneoTV) {
        renderizarVistaResultadosUnificada('cabecera-tabla-tv', objTorneo);
        renderizarPedana('contenedor-pedana-tv', objTorneo);
        if (modoVistaTV === 'dividido') {
            renderizarVistaResultadosUnificada('cabecera-tabla-split', objTorneo);
            renderizarPedana('contenedor-pedana-split', objTorneo);
        }
    }
}

// ==========================================
// VISTA RESULTADOS UNIFICADA (DISEÑO EMPRESARIAL)
// ==========================================
window.setFiltroCategoria = function(cat) { filtroCategoria = cat; if(esAdmin)cargarResultados(torneoAdmin.id); else cargarResultados(torneoTV.id); }
window.setFiltroBusqueda = function(txt) { filtroBusqueda = txt.toLowerCase(); if(esAdmin)cargarResultados(torneoAdmin.id); else cargarResultados(torneoTV.id); }

function formatearNombre(nombre) {
    const maxChars = 14; 
    if (nombre.length > maxChars) {
        return nombre.substring(0, maxChars).trim() + '...';
    }
    return nombre;
}

function renderizarVistaResultadosUnificada(idCabecera, torneoConfig) {
    const theadDOM = document.getElementById(idCabecera);
    if (!theadDOM || !torneoConfig) return;
    const tabla = theadDOM.parentElement; 
    
    tabla.className = torneoConfig.platos_por_serie > 12 ? 'muchos-platos' : '';
    
    let listaFiltrada = [...tiradoresLocales];
    if (filtroCategoria !== 'Todas') listaFiltrada = listaFiltrada.filter(t => t.categoria === filtroCategoria);
    if (filtroBusqueda !== '') listaFiltrada = listaFiltrada.filter(t => t.tirador.toLowerCase().includes(filtroBusqueda) || t.categoria.toLowerCase().includes(filtroBusqueda));
    
    listaFiltrada.sort((a, b) => b.puntajeFinal - a.puntajeFinal || b.barrage - a.barrage || b.totalAciertos - a.totalAciertos || a.orden - b.orden);

    let posActual = 1;
    let lastScoreIdentifier = null;
    listaFiltrada.forEach((row, index) => {
        let currentScoreIdentifier = `${row.puntajeFinal}-${row.barrage}-${row.totalAciertos}`;
        if (lastScoreIdentifier !== currentScoreIdentifier) { posActual = index + 1; lastScoreIdentifier = currentScoreIdentifier; }
        row.posicionFija = posActual;
    });

    const wPos = '4%', wNum = '4%', wTirador = '21%', wCat = '8%', wTot = '5.5%', wBar = '5.5%', wFin = '6%';
    const wPlato = (46 / Math.max(1, torneoConfig.platos_por_serie)) + '%'; 

    let htmlCabecera = `<thead id="${idCabecera}"><tr>
        <th style="width:${wPos}; text-align:center;">POS.</th>
        <th style="width:${wNum}; text-align:center;">Nº</th>
        <th style="width:${wTirador}; text-align:left; padding-left:15px;">TIRADOR</th>
        <th style="width:${wCat}; text-align:center;">CAT.</th>`;
    for(let i=1; i<=torneoConfig.platos_por_serie; i++) htmlCabecera += `<th style="width:${wPlato}; text-align:center;">${i}</th>`;
    htmlCabecera += `<th style="width:${wTot}; text-align:center;">TOTAL</th><th style="width:${wBar}; text-align:center;">BARRAGE</th><th style="width:${wFin}; text-align:center;">FINAL</th></tr></thead>`;

    function buildFilas(lista) {
        let html = '';
        lista.forEach(row => {
            let htmlPlatosMultiTD = '';
            for(let i = 0; i < torneoConfig.platos_por_serie; i++) {
                let val = row.resultados[i];
                if (val === 1) htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box plate-hit mx-auto">✔</div></td>`; 
                else if (val === 0) htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box plate-miss mx-auto">✖</div></td>`; 
                else htmlPlatosMultiTD += `<td style="width:${wPlato}; text-align:center;"><div class="plate-box mx-auto">-</div></td>`;
            }
            let barrageTxt = row.barrage > 0 ? `<span style="color:var(--accent-yellow); font-weight:900;">${row.barrage}</span>` : '-';
            let badgeSerie = row.totalAciertos === torneoConfig.platos_por_serie && torneoConfig.platos_por_serie > 0 ? `<span class="badge-serie">EN SERIE</span>` : '';
            let catClass = row.categoria.includes('Vet') ? 'supervet' : (row.categoria === 'Junior' ? 'junior' : (row.categoria === 'Principiante' ? 'principiante' : ''));
            let nombreCortado = formatearNombre(row.tirador);
            
            html += `
                <tr>
                    <td style="width:${wPos}; color: white; font-weight: bold; background-color: #050505; text-align:center;">${row.posicionFija}</td>
                    <td style="width:${wNum}; text-align:center; font-weight: normal; color: #AAA;">${row.orden}</td>
                    <td style="width:${wTirador}; text-align: left; padding-left:15px; font-weight:bold; white-space:nowrap; overflow:hidden; color:white;" title="${row.tirador}">${nombreCortado} ${badgeSerie}</td>
                    <td style="width:${wCat}; font-size: 0.85rem; text-align:center;"><span class="tag-categoria ${catClass}">${row.categoria.toUpperCase()}</span></td>
                    ${htmlPlatosMultiTD}
                    <td style="width:${wTot}; font-size: 1.3rem; font-weight: bold; text-align:center; color:white;">${row.totalAciertos}</td>
                    <td style="width:${wBar}; font-size: 1.2rem; font-weight: bold; text-align:center;">${barrageTxt}</td>
                    <td style="width:${wFin}; font-size: 1.6rem; font-weight: bold; color: white; text-align:center;">${row.puntajeFinal}</td>
                </tr>`;
        });
        return html;
    }

    let htmlCompleto = htmlCabecera;

    if (modoTvActivo) {
        let enSerie = listaFiltrada.filter(t => t.totalAciertos === torneoConfig.platos_por_serie && t.totalTirados > 0);
        let resto = listaFiltrada.filter(t => !(t.totalAciertos === torneoConfig.platos_por_serie && t.totalTirados > 0));

        htmlCompleto += `<tbody class="tbody-enserie">`;
        if(enSerie.length > 0) {
            /* Acá envolvemos el texto en el div .separador-box para que no ocupe todo el ancho */
            htmlCompleto += `<tr class="tr-separador"><td colspan="100%"><div class="separador-box">EN SERIE</div></td></tr>`;
            htmlCompleto += buildFilas(enSerie);
        }
        htmlCompleto += `</tbody>`;
        
        if(resto.length > 0) {
            /* Lo mismo acá para "Resto de los tiradores" */
            htmlCompleto += `<tbody class="tbody-resto-header"><tr class="tr-separador"><td colspan="100%"><div class="separador-box">RESTO DE LOS TIRADORES</div></td></tr></tbody>`;
            htmlCompleto += `<tbody class="tbody-resto">`;
            htmlCompleto += buildFilas(resto);
            htmlCompleto += `</tbody>`;
        }
    } else {
        htmlCompleto += `<tbody>` + buildFilas(listaFiltrada) + `</tbody>`;
    }

    tabla.innerHTML = htmlCompleto;
}

// ==========================================
// TIRADOR EN PEDANA
// ==========================================
function renderizarPedana(containerId, torneoConfig) {
    const cont = document.getElementById(containerId);
    if (!cont || !torneoConfig) return;
    
    let lista = [...tiradoresLocales].sort((a,b) => a.orden - b.orden);
    if (lista.length === 0) { cont.innerHTML = '<h3 style="text-align:center;">No hay tiradores</h3>'; return; }
    
    let idx = torneoConfig.tirador_actual_index || 0;
    if (idx >= lista.length) idx = lista.length - 1;
    let actual = lista[idx];

    let htmlPlatos = `<div class="plates-container" style="flex-wrap: wrap; justify-content: center; margin-top: 15px; gap: 6px;">`;
    let tirados = 0;
    for(let i=0; i<torneoConfig.platos_por_serie; i++){
        let val = actual.resultados[i];
        if(val !== null) tirados++;
        if(val === 1) htmlPlatos += `<div class="plate-box pedana-plate plate-hit">✔</div>`;
        else if (val === 0) htmlPlatos += `<div class="plate-box pedana-plate plate-miss">✖</div>`;
        else htmlPlatos += `<div class="plate-box pedana-plate" style="background-color: #111;"></div>`;
    }
    htmlPlatos += '</div>';

    let htmlNext = `
        <div style="text-align: left; position: relative;">
            <div class="pedana-lbl-prox">PRÓXIMOS TIRADORES</div>
            <div class="pedana-next-grid">
    `;
    for(let i=1; i<=3; i++) {
        let sig = lista[idx + i];
        if (sig) {
            let catClass = sig.categoria.includes('Vet') ? 'supervet' : (sig.categoria === 'Junior' ? 'junior' : (sig.categoria === 'Principiante' ? 'principiante' : ''));
            htmlNext += `
                <div class="pedana-next-box">
                    <div class="pedana-next-orden">${sig.orden}</div>
                    <div class="pedana-next-nombre">${formatearNombre(sig.tirador)}</div>
                    <div><span class="tag-categoria ${catClass}" style="font-size: 0.9rem; padding: 4px 10px;">${sig.categoria.toUpperCase()}</span></div>
                </div>`;
        } else {
            htmlNext += `<div class="pedana-next-box" style="opacity: 0.1;"><div class="pedana-next-orden">-</div></div>`;
        }
    }
    htmlNext += '</div></div>';

    let catClassAct = actual.categoria.includes('Vet') ? 'supervet' : (actual.categoria === 'Junior' ? 'junior' : (actual.categoria === 'Principiante' ? 'principiante' : ''));

    cont.innerHTML = `
        <div class="pedana-container">
            <div class="pedana-main">
                <div class="pedana-lbl">LLAMADO A PEDANA</div>
                <div class="pedana-orden">${actual.orden}</div>
                <div class="pedana-nombre">${actual.tirador}</div>
                <div><span class="tag-categoria ${catClassAct}" style="font-size: 1.1rem; padding: 5px 16px;">${actual.categoria.toUpperCase()}</span></div>
                ${htmlPlatos}
                <div class="pedana-stats">
                    <span class="numero-grande">${actual.totalAciertos}</span>
                    <span class="texto-chico">DE ${torneoConfig.platos_por_serie} PLATOS • ${tirados} TIRADOS</span>
                </div>
            </div>
            ${htmlNext}
        </div>
    `;
}

window.cambiarPedana = async function(delta) {
    if (!torneoAdmin) return;
    let max = tiradoresLocales.length - 1;
    let newIdx = (torneoAdmin.tirador_actual_index || 0) + delta;
    if (newIdx < 0) newIdx = 0; if (newIdx > max) newIdx = max;
    await clienteSupabase.from('torneos').update({ tirador_actual_index: newIdx }).eq('id', torneoAdmin.id);
    torneoAdmin.tirador_actual_index = newIdx;
    renderizarPedana('contenedor-pedana-admin', torneoAdmin);
    avisarALaTV();
}

// ==========================================
// ESTADÍSTICAS Y GESTIÓN
// ==========================================
const CATEGORIAS = ["Senior", "Veterano", "Super Vet.", "Dama", "Principiante", "Junior"];

function claveRanking(t) { return [t.puntajeFinal, t.barrage || 0, t.totalAciertos]; }
function mismoRanking(a, b) { const x = claveRanking(a), y = claveRanking(b); return x[0] === y[0] && x[1] === y[1] && x[2] === y[2]; }

function ganadoresDeCategoria(cat) {
    const lista = tiradoresLocales.filter(t => t.categoria === cat);
    if (lista.length === 0) return null;
    const conTiros = lista.filter(t => t.totalTirados > 0);
    const provisorio = lista.some(t => t.totalTirados < torneoAdmin.platos_por_serie);
    if (conTiros.length === 0) return { ganadores: [], empate: false, provisorio: true, total: lista.length };
    
    const ordenados = [...conTiros].sort((a, b) => b.puntajeFinal - a.puntajeFinal || (b.barrage || 0) - (a.barrage || 0) || b.totalAciertos - a.totalAciertos || a.orden - b.orden);
    const mejor = ordenados[0];
    const ganadores = ordenados.filter(t => mismoRanking(t, mejor));
    let esEmpate = ganadores.length > 1;
    return { ganadores, empate: esEmpate, provisorio, total: lista.length };
}

function htmlGanadoresPorCategoria() {
    let html = '<div class="winners-grid">';
    CATEGORIAS.forEach(cat => {
        const g = ganadoresDeCategoria(cat);
        if (!g) { 
            html += `<div class="winner-box vacio"><h4>${cat.toUpperCase()}</h4><div class="winner-name" style="color:var(--text-muted); font-size:1rem;">Sin tiradores</div></div>`; 
            return; 
        }
        const estado = g.provisorio ? '<span class="winner-estado prov">PROVISORIO</span>' : '<span class="winner-estado fin">FINAL</span>';
        if (g.ganadores.length === 0) { 
            html += `<div class="winner-box"><h4>${cat.toUpperCase()} ${estado}</h4><div class="winner-name" style="color:var(--text-muted); font-size:1rem;">Aún sin resultados</div></div>`; 
            return; 
        }
        
        const aciertosNormales = g.ganadores[0].totalAciertos;
        const barrageVal = g.ganadores[0].barrage || 0;
        const detalleBarrage = barrageVal > 0 ? ` (barrage ${barrageVal})` : '';
        const nombres = g.ganadores.map(t => `<div class="winner-name">${t.tirador} <span class="winner-orden">Nº ${t.orden}</span></div>`).join('');
        let tagEmpateHTML = g.empate ? `<div class="winner-tag">EMPATE</div>` : '';

        html += `
            <div class="winner-box ${g.empate ? 'empate' : 'unico'}">
                <h4>${cat.toUpperCase()} ${estado}</h4>
                ${tagEmpateHTML}
                ${nombres}
                <div class="winner-pts">${aciertosNormales} de ${torneoAdmin.platos_por_serie}${detalleBarrage}</div>
            </div>`;
    });
    return html + '</div>';
}

function renderizarStats() {
    const cont = document.getElementById('contenedor-stats');
    if (!cont || !torneoAdmin) return;
    if (tiradoresLocales.length === 0) { cont.innerHTML = '<p>No hay datos.</p>'; return; }

    const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    const valorObj = costos["Objetivo"] || 1000;
    const retencionPct = costos["Retencion"] || 10;

    let totTiradores = tiradoresLocales.length;
    let totObjetivos = totTiradores * torneoAdmin.platos_por_serie;
    let tirados = 0, pegados = 0, errados = 0;
    let cats = { "Senior":0, "Veterano":0, "Super Vet.":0, "Dama":0, "Principiante":0, "Junior":0 };
    let recaudado = 0;

    tiradoresLocales.forEach(t => {
        cats[t.categoria] = (cats[t.categoria] || 0) + 1;
        recaudado += (costos[t.categoria] || 0);
        t.resultados.forEach(r => { if(r !== null) { tirados++; if(r===1) pegados++; else errados++; } });
    });

    let objRetencion = tirados * valorObj;
    let porcentajeRet = (recaudado * retencionPct) / 100;
    let premios = recaudado - objRetencion - porcentajeRet; if(premios<0) premios=0;
    let quedaClub = recaudado - premios;

    let html = `
        <h2 class="titulo-amarillo">OBJETIVOS</h2>
        <div class="stats-grid">
            <div class="stat-box azul"><h4>OBJETIVOS TOTALES</h4><div class="val">${totObjetivos}</div><div class="sub">${totTiradores} tiradores x ${torneoAdmin.platos_por_serie} platos</div></div>
            <div class="stat-box" style="border-top-color: white;"><h4>TIRADOS</h4><div class="val">${tirados}</div><div class="sub">${totObjetivos - tirados} por tirar</div></div>
            <div class="stat-box verde"><h4>ACERTADOS</h4><div class="val">${pegados}</div><div class="sub">${tirados>0?((pegados/tirados)*100).toFixed(1):0}% de aciertos</div></div>
            <div class="stat-box rojo"><h4>ERRADOS</h4><div class="val">${errados}</div><div class="sub">${tirados>0?((errados/tirados)*100).toFixed(1):0}% de errados</div></div>
        </div>
        
        <h2 class="titulo-amarillo">TIRADORES POR CATEGORÍA</h2>
        <div class="stats-grid" style="grid-template-columns: repeat(6, 1fr);">
            <div class="stat-box"><h4>SENIOR</h4><div class="val">${cats["Senior"]}</div></div>
            <div class="stat-box"><h4>VETERANO</h4><div class="val">${cats["Veterano"]}</div></div>
            <div class="stat-box"><h4>SUPER VET.</h4><div class="val">${cats["Super Vet."]}</div></div>
            <div class="stat-box"><h4>DAMA</h4><div class="val">${cats["Dama"]}</div></div>
            <div class="stat-box"><h4>PRINCIPIANTE</h4><div class="val">${cats["Principiante"]}</div></div>
            <div class="stat-box"><h4>JUNIOR</h4><div class="val">${cats["Junior"]}</div></div>
        </div>

        <h2 class="titulo-amarillo">GANADORES POR CATEGORÍA</h2>
        ${htmlGanadoresPorCategoria()}

        <h2 class="titulo-amarillo">FINANZAS</h2>
        <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
            <div class="stat-box"><h4>TOTAL RECAUDADO</h4><div class="val">$ ${(recaudado).toLocaleString('es-AR')}</div></div>
            <div class="stat-box"><h4>SE QUEDA EL CLUB</h4><div class="val" style="color:var(--accent-yellow);">$ ${(quedaClub).toLocaleString('es-AR')}</div><div class="sub">Retención + Objetivos</div></div>
            <div class="stat-box"><h4>VA A PREMIOS</h4><div class="val">$ ${(premios).toLocaleString('es-AR')}</div></div>
        </div>
    `;
    cont.innerHTML = html;
}

function cargarFormularioCostos() {
    if (!torneoAdmin) return;
    const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    document.getElementById('costo-Senior').value = costos["Senior"] || 0;
    document.getElementById('costo-Veterano').value = costos["Veterano"] || 0;
    document.getElementById('costo-Super Vet.').value = costos["Super Vet."] || 0;
    document.getElementById('costo-Dama').value = costos["Dama"] || 0;
    document.getElementById('costo-Junior').value = costos["Junior"] || 0;
    document.getElementById('costo-Principiante').value = costos["Principiante"] || 0;
    document.getElementById('costo-Objetivo').value = costos["Objetivo"] || 1000;
    document.getElementById('costo-Retencion').value = costos["Retencion"] || 10;
}
window.guardarCostos = async function() {
    if (!torneoAdmin) return;
    const nuevosCostos = {
        "Senior": parseInt(document.getElementById('costo-Senior').value) || 0,
        "Veterano": parseInt(document.getElementById('costo-Veterano').value) || 0,
        "Super Vet.": parseInt(document.getElementById('costo-Super Vet.').value) || 0,
        "Dama": parseInt(document.getElementById('costo-Dama').value) || 0,
        "Junior": parseInt(document.getElementById('costo-Junior').value) || 0,
        "Principiante": parseInt(document.getElementById('costo-Principiante').value) || 0,
        "Objetivo": parseInt(document.getElementById('costo-Objetivo').value) || 1000,
        "Retencion": parseInt(document.getElementById('costo-Retencion').value) || 10
    };
    await clienteSupabase.from('torneos').update({ costos: nuevosCostos }).eq('id', torneoAdmin.id);
    torneoAdmin.costos = nuevosCostos;
    renderizarAdminBaseDatos(); renderizarStats(); mostrarAlerta("Costos actualizados con éxito.");
}

window.renderizarAdminJueces = function() {
    const sidebar = document.getElementById('juez-lista-tiradores');
    if (!sidebar || !torneoAdmin) return;
    sidebar.innerHTML = '';
    const filtro = document.getElementById('buscador-jueces').value.toLowerCase();
    let listaFiltro = [...tiradoresLocales].sort((a, b) => b.puntajeFinal - a.puntajeFinal || b.barrage - a.barrage || b.totalAciertos - a.totalAciertos || a.orden - b.orden);
    if (filtro) listaFiltro = listaFiltro.filter(t => t.tirador.toLowerCase().includes(filtro) || t.categoria.toLowerCase().includes(filtro));

    if (!tiradoresLocales.find(x => x.id === tiradorJuezActivoId)) {
        const primero = [...tiradoresLocales].sort((a, b) => a.orden - b.orden)[0];
        tiradorJuezActivoId = primero ? primero.id : null;
    }

    listaFiltro.forEach(row => {
        sidebar.innerHTML += `<div class="juez-list-item ${(tiradorJuezActivoId === row.id) ? 'active' : ''}" onclick="seleccionarTiradorJuez('${row.id}')"><span>${row.orden}. ${row.tirador}</span><span style="color: white; font-weight: bold;">${row.totalTirados}/${torneoAdmin.platos_por_serie}</span></div>`;
    });
    renderizarPanelDerechoJuez();
}
window.seleccionarTiradorJuez = function(id) { tiradorJuezActivoId = id; renderizarAdminJueces(); }

window.cambiarTiradorJuez = function(delta) {
    const porOrden = [...tiradoresLocales].sort((a, b) => a.orden - b.orden);
    if (porOrden.length === 0) return;
    let i = porOrden.findIndex(x => x.id === tiradorJuezActivoId);
    if (i === -1) i = 0;
    const nuevo = Math.max(0, Math.min(porOrden.length - 1, i + delta));
    tiradorJuezActivoId = porOrden[nuevo].id;
    renderizarAdminJueces();
    const activo = document.querySelector('#juez-lista-tiradores .juez-list-item.active');
    if (activo) activo.scrollIntoView({ block: 'nearest' });
}

function renderizarPanelDerechoJuez() {
    const panel = document.getElementById('juez-panel-activo');
    if (!panel) return;
    if (!tiradorJuezActivoId) { panel.innerHTML = '<h2 style="margin-top: 0; color: var(--text-muted); text-align: center;">Seleccione un tirador de la lista</h2>'; return; }
    const t = tiradoresLocales.find(x => x.id === tiradorJuezActivoId);
    if (!t) return;

    let htmlPlatos = '<div class="plates-container" style="flex-wrap: wrap; justify-content: center; margin-bottom: 30px;">';
    for(let i = 0; i < torneoAdmin.platos_por_serie; i++) {
        let val = t.resultados[i]; let cssClass = val === 1 ? 'plate-hit' : (val === 0 ? 'plate-miss' : ''); let text = val === 1 ? '✔' : (val === 0 ? '✖' : (i + 1));
        htmlPlatos += `<div class="plate-box admin-plate ${cssClass}" style="width: 45px; height: 45px; font-size:1.2rem; margin:3px;" onclick="togglePlato('${t.id}', ${i}, this)">${text}</div>`;
    }
    htmlPlatos += '</div>';

    panel.innerHTML = `
        <div class="juez-main-header">${t.tirador}</div>
        <div class="juez-main-subtitle">(Nº ${t.orden} - ${t.categoria})</div>
        
        <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 20px;">
            <button class="btn-outline" onclick="cambiarTiradorJuez(-1)" style="font-size: 1rem; padding: 10px 20px;">← Anterior</button>
            <button onclick="cambiarTiradorJuez(1)" style="font-size: 1rem; padding: 10px 20px;">Siguiente tirador (Nº ${(() => { const l = [...tiradoresLocales].sort((a, b) => a.orden - b.orden); const i = l.findIndex(x => x.id === t.id); return l[i + 1] ? l[i + 1].orden : '-'; })()}) →</button>
        </div>
        <div style="font-size: 1.5rem; color: ${t.totalTirados === torneoAdmin.platos_por_serie ? 'var(--success)' : 'var(--accent-yellow)'}; font-weight: bold; margin-bottom: 5px;">SERIE ${t.totalTirados === torneoAdmin.platos_por_serie ? 'COMPLETA' : 'EN CURSO'}: ${t.totalTirados} DE ${torneoAdmin.platos_por_serie}</div>
        <div style="font-size: 1.1rem; color: var(--text-muted); margin-bottom: 20px;">Aciertos: ${t.totalAciertos}</div>
        <div style="background-color: var(--bg-main); padding: 20px; border-radius: 8px; margin-bottom: 20px;">${htmlPlatos}</div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 30px; background-color: var(--bg-main); padding: 20px; border-radius: 8px;"><label style="font-size: 1.2rem; font-weight: bold;">BARRAGE (Desempate):</label><input type="number" id="input-barrage-${t.id}" class="barrage-input" value="${t.barrage || 0}"><button onclick="guardarBarrage('${t.id}')">Guardar</button></div>
    `;
}
window.guardarBarrage = async function(id) {
    let nuevo = parseInt(document.getElementById(`input-barrage-${id}`).value) || 0;
    let t = tiradoresLocales.find(x => x.id === id); if(t) { t.barrage = nuevo; t.puntajeFinal = t.totalAciertos + t.barrage; }
    await clienteSupabase.from('inscripciones').update({ barrage: nuevo }).eq('id', id);
    renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); avisarALaTV();
}

function renderizarAdminBaseDatos() {
    const tbody = document.getElementById('lista-edicion-tiradores');
    if (!tbody || !torneoAdmin) return;
    tbody.innerHTML = '';
    const costos = torneoAdmin.costos || { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000 };
    [...tiradoresLocales].sort((a, b) => a.orden - b.orden).forEach(row => {
        let catClass = row.categoria.includes('Vet') ? 'supervet' : (row.categoria === 'Junior' ? 'junior' : (row.categoria === 'Principiante' ? 'principiante' : ''));
        tbody.innerHTML += `<tr><td><strong>${row.orden}</strong></td><td style="font-weight: bold; text-transform: uppercase;">${row.tirador}</td><td><span class="tag-categoria ${catClass}">${row.categoria.toUpperCase()}</span></td><td><span class="tag-paralelo">P1</span> <span class="tag-paralelo">P2</span></td><td style="color: white; font-weight: bold;">$ ${(costos[row.categoria] || 0).toLocaleString('es-AR')}</td><td><button class="btn-outline" onclick="abrirModalEditar('${row.id}', '${row.tirador}', ${row.orden}, '${row.categoria}')">Editar</button> <button class="btn-outline-danger" onclick="eliminarTirador('${row.id}')">Eliminar</button></td></tr>`;
    });
}

window.exportarExcel = function() {
    if (!torneoAdmin || tiradoresLocales.length === 0) return mostrarAlerta("No hay datos para exportar.");
    const lista = [...tiradoresLocales].sort((a, b) => b.puntajeFinal - a.puntajeFinal || b.barrage - a.barrage || b.totalAciertos - a.totalAciertos || a.orden - b.orden);
    const datos = lista.map((t, i) => {
        let fila = { 'POS': i + 1, 'ORDEN': t.orden, 'TIRADOR': t.tirador, 'CAT': t.categoria };
        for(let j=0; j<torneoAdmin.platos_por_serie; j++) fila[`P${j+1}`] = t.resultados[j] === 1 ? 'A' : (t.resultados[j] === 0 ? 'F' : '-');
        fila['TOTAL'] = t.totalAciertos; fila['BARRAGE'] = t.barrage || 0; fila['FINAL'] = t.puntajeFinal; return fila;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Resultados");
    XLSX.writeFile(wb, `Resultados_${torneoAdmin.nombre.replace(/ /g, '_')}.xlsx`);
}

function avisarALaTV() { canalRealtime.send({ type: 'broadcast', event: 'recargar_pantallas', payload: {} }); }

window.togglePlato = async function(idRow, idx, html) {
    let t = tiradoresLocales.find(x => x.id === idRow);
    if(t.resultados[idx] === null) t.resultados[idx] = 1; else if(t.resultados[idx] === 1) t.resultados[idx] = 0; else t.resultados[idx] = null;
    t.totalAciertos = t.resultados.filter(r => r === 1).length; t.totalTirados = t.resultados.filter(r => r !== null).length; t.puntajeFinal = t.totalAciertos + (t.barrage || 0);
    renderizarAdminJueces(); renderizarVistaResultadosUnificada('cabecera-tabla-admin', torneoAdmin); renderizarPedana('contenedor-pedana-admin', torneoAdmin); renderizarStats();
    await clienteSupabase.from('inscripciones').update({ resultados: t.resultados }).eq('id', idRow); avisarALaTV();
}

window.abrirModalEditar = function(id, nom, ord, cat) { document.getElementById('edit-id').value = id; document.getElementById('edit-tirador').value = nom; document.getElementById('edit-orden').value = ord; document.getElementById('edit-categoria').value = cat; document.getElementById('modal-editar').style.display = 'flex'; }
window.cerrarModalEditar = () => document.getElementById('modal-editar').style.display = 'none';

window.guardarEdicionTirador = async function() {
    let nuevoOrden = parseInt(document.getElementById('edit-orden').value);
    let idActual = document.getElementById('edit-id').value;
    const repetido = tiradoresLocales.some(t => t.orden === nuevoOrden && t.id !== idActual);
    if (repetido) return mostrarAlerta(`El número de orden Nº ${nuevoOrden} ya está asignado a otro tirador en este torneo.`);

    await clienteSupabase.from('inscripciones').update({ tirador: document.getElementById('edit-tirador').value, orden: nuevoOrden, categoria: document.getElementById('edit-categoria').value }).eq('id', idActual);
    cerrarModalEditar(); await cargarResultados(torneoAdmin.id); avisarALaTV();
}

window.agregarTirador = async function() {
    let orden = parseInt(document.getElementById('input-orden').value);
    let tirador = document.getElementById('input-tirador').value;
    if(!orden || !tirador) return mostrarAlerta("Faltan datos de Orden o Nombre del tirador.");
    
    const repetido = tiradoresLocales.some(t => t.orden === orden);
    if (repetido) return mostrarAlerta(`El número de orden Nº ${orden} ya existe en este torneo. No se puede repetir.`);

    await clienteSupabase.from('inscripciones').insert([{ torneo_id: torneoAdmin.id, orden: orden, tirador: tirador, categoria: document.getElementById('input-categoria').value, resultados: Array(torneoAdmin.platos_por_serie).fill(null), barrage: 0 }]);
    document.getElementById('input-orden').value = ''; document.getElementById('input-tirador').value = ''; await cargarResultados(torneoAdmin.id); avisarALaTV();
}

window.eliminarTirador = function(id) { 
    mostrarConfirmacion("¿Estás seguro de eliminar este tirador?", async () => {
        await clienteSupabase.from('inscripciones').delete().eq('id', id); 
        await cargarResultados(torneoAdmin.id); 
        avisarALaTV();
    });
}

window.crearTorneo = async function() {
    const n = document.getElementById('input-nuevo-torneo').value;
    const f = document.getElementById('input-fecha-torneo').value;
    const p = document.getElementById('input-platos').value;
    
    if (!n || !f) return mostrarAlerta("El nombre y la fecha del torneo son OBLIGATORIOS.");
    
    const c = { "Senior": 20000, "Veterano": 20000, "Super Vet.": 15000, "Dama": 10000, "Junior": 10000, "Principiante": 10000, "Objetivo": 1000, "Retencion": 10 };
    await clienteSupabase.from('torneos').insert([{ nombre: n, fecha: f, platos_por_serie: parseInt(p), estado: 'Activo', costos: c, tirador_actual_index: 0 }]);
    
    document.getElementById('input-nuevo-torneo').value = '';
    document.getElementById('input-fecha-torneo').value = '';
    
    await inicializarDatos(); avisarALaTV();
}

window.editarTorneoActual = async function() {
    const f = document.getElementById('edit-fecha-torneo').value;
    if (!f) return mostrarAlerta("La fecha del torneo no puede quedar vacía.");
    await clienteSupabase.from('torneos').update({ nombre: document.getElementById('edit-nombre-torneo').value, fecha: f, platos_por_serie: parseInt(document.getElementById('edit-platos-torneo').value) }).eq('id', torneoAdmin.id);
    await inicializarDatos(); avisarALaTV(); mostrarAlerta('Torneo actualizado correctamente.');
}

window.eliminarTorneoActual = function() {
    mostrarConfirmacion("Vas a ELIMINAR el torneo completo junto con TODOS sus tiradores. Esta acción no se puede deshacer.", async () => {
        await clienteSupabase.from('inscripciones').delete().eq('torneo_id', torneoAdmin.id); 
        await clienteSupabase.from('torneos').delete().eq('id', torneoAdmin.id);
        torneoAdmin = null; 
        await inicializarDatos(); 
        avisarALaTV();
    });
}

canalRealtime.on('broadcast', { event: 'recargar_pantallas' }, async () => {
    if (!esAdmin) {
        if (torneoTV) {
            const { data } = await clienteSupabase.from('torneos').select('*').eq('id', torneoTV.id).single();
            if (data) torneoTV = data;
            cargarResultados(torneoTV.id);
        } else inicializarDatos(); 
    }
}).subscribe();

document.addEventListener('DOMContentLoaded', verificarSesion);