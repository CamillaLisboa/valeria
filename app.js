/* =========================================================
   Controle de Atendimentos — APAI
   Dados salvos no localStorage do navegador.
   ========================================================= */

const AREAS = [
  'Fisioterapia',
  'Psicopedagogia',
  'Psicologia',
  'Nutrição',
  'Fonoaudiologia',
  'Terapia Ocupacional',
];

const CIDADES = ['Garça', 'Gália', 'Lupércio', 'Vera Cruz', 'Fernão'];

// Idade a partir da qual o CID passa a ser obrigatório
const CID_IDADE_MIN = 4;

const STATUS_LABEL = { fila: 'Fila', ativo: 'Ativo', desligado: 'Desligado' };
const TSTATUS_LABEL = { fila: 'Aguardando', atendimento: 'Em atendimento', encerrada: 'Encerrada' };
const FAIXA_LABEL = { '0-12': '0 a 12 anos', '13+': 'Acima de 12 anos', '': 'Sem data de nascimento' };

const STORAGE_KEY = 'apai-controle-v1';

/* ---------------- Estado ---------------- */

let db = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw) return { pacientes: [], profissionais: [], coordenadores: [], convenios: [], ...raw };
  } catch (e) { /* ignora */ }
  return { pacientes: [], profissionais: [], coordenadores: [], convenios: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    alert('Não foi possível salvar os dados neste navegador.');
  }
  renderAll();
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------------- Utilidades ---------------- */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtData(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((new Date(hojeISO()) - new Date(iso)) / 86400000);
}

function idade(iso) {
  if (!iso) return null;
  const n = new Date(iso + 'T00:00');
  const h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
  return a;
}

function faixa(p) {
  const i = idade(p.dataNascimento);
  if (i === null) return '';
  return i <= 12 ? '0-12' : '13+';
}

function statusGeral(p) {
  if (p.dataDesligamento) return 'desligado';
  if ((p.terapias || []).some(t => t.status === 'atendimento')) return 'ativo';
  return 'fila';
}

// Lista de CIDs do paciente (aceita o formato antigo, com um único CID em texto)
const cidsDe = p => Array.isArray(p.cids) ? p.cids : (p.cid ? [p.cid] : []);

const byId = (list, id) => db[list].find(x => x.id === id);
const profNome = id => byId('profissionais', id)?.nome || '';
const coordNome = id => byId('coordenadores', id)?.nome || '';
const convNome = id => byId('convenios', id)?.nome || '';

function fillSelect(sel, opts, placeholder) {
  const cur = sel.value;
  sel.innerHTML = (placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '') +
    opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

const optCidades = () => CIDADES.map(c => ({ value: c, label: c }));
const optAreas = () => AREAS.map(a => ({ value: a, label: a }));
const optProfs = () => [...db.profissionais].sort((a, b) => a.nome.localeCompare(b.nome))
  .map(p => ({ value: p.id, label: `${p.nome} (${p.area})` }));
const optCoords = () => [...db.coordenadores].sort((a, b) => a.nome.localeCompare(b.nome))
  .map(c => ({ value: c.id, label: `${c.nome} — ${c.cidade}` }));
const convLabel = c => `${c.nome}${c.cidade ? ' — ' + c.cidade : ''}${c.faixa ? ' (' + FAIXA_LABEL[c.faixa] + ')' : ''}`;
const optConvs = () => [...db.convenios].sort((a, b) => a.nome.localeCompare(b.nome))
  .map(c => ({ value: c.id, label: convLabel(c) }));

function refreshSelects() {
  $$('.sel-cidade').forEach(s => fillSelect(s, optCidades(), '—'));
  $$('.sel-cidade-req').forEach(s => fillSelect(s, optCidades(), 'Selecione…'));
  $$('.sel-cidade-todas').forEach(s => fillSelect(s, optCidades(), 'Todas as cidades'));
  $$('.sel-cidade-filtro').forEach(s => fillSelect(s, optCidades(), 'Todas'));
  $$('.sel-area-req').forEach(s => fillSelect(s, optAreas(), 'Selecione…'));
  $$('.sel-area-filtro').forEach(s => fillSelect(s, optAreas(), 'Todas'));
  $$('.sel-prof-filtro').forEach(s => fillSelect(s, optProfs(), 'Todos'));
  $$('.sel-coord-filtro').forEach(s => fillSelect(s, optCoords(), 'Todos'));
  $$('.sel-conv-filtro').forEach(s => fillSelect(s, optConvs(), 'Todos'));

  fillSelect($('#dash-cidade'), optCidades(), 'Todas');
  fillSelect($('#dash-conv'), optConvs(), 'Todos');
  fillSelect($('#filtro-cidade'), optCidades(), 'Todas as cidades');
  fillSelect($('#filtro-conv'), optConvs(), 'Todos os convênios');
  fillSelect($('#filtro-area'), optAreas(), 'Todas as áreas');
  fillSelect($('#filtro-prof'), optProfs(), 'Todos os profissionais');
}

/* ---------------- Navegação ---------------- */

$$('.nav-btn').forEach(b => b.addEventListener('click', () => {
  $$('.nav-btn').forEach(x => x.classList.toggle('active', x === b));
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + b.dataset.view; });
  window.scrollTo(0, 0);
}));

/* =========================================================
   DASHBOARD
   ========================================================= */

['#dash-cidade', '#dash-conv', '#dash-faixa'].forEach(s => $(s).addEventListener('change', renderDashboard));

function pacientesDashboard() {
  const cid = $('#dash-cidade').value, conv = $('#dash-conv').value, fx = $('#dash-faixa').value;
  return db.pacientes.filter(p =>
    (!cid || p.cidadeAtendimento === cid) &&
    (!conv || p.convenioId === conv) &&
    (!fx || faixa(p) === fx));
}

function contarStatus(lista) {
  const c = { fila: 0, ativo: 0, desligado: 0, total: lista.length };
  lista.forEach(p => c[statusGeral(p)]++);
  return c;
}

function renderDashboard() {
  const pacs = pacientesDashboard();
  const st = contarStatus(pacs);
  const naoDesl = pacs.filter(p => statusGeral(p) !== 'desligado');
  const terapiasAbertas = naoDesl.flatMap(p => (p.terapias || []).map(t => ({ ...t, p })));
  const emAtend = terapiasAbertas.filter(t => t.status === 'atendimento');
  const emFila = terapiasAbertas.filter(t => t.status === 'fila');
  const esperas = emFila.map(t => diasDesde(t.dataFila || t.p.dataTriagem)).filter(d => d !== null);
  const esperaMedia = esperas.length ? Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length) : 0;
  const mes = hojeISO().slice(0, 7);
  const triagensMes = pacs.filter(p => (p.dataTriagem || '').startsWith(mes)).length;
  const desligMes = pacs.filter(p => (p.dataDesligamento || '').startsWith(mes)).length;
  const semCid = naoDesl.filter(p => idade(p.dataNascimento) >= CID_IDADE_MIN && !cidsDe(p).length).length;

  const kpi = (label, val, cls = '', sub = '') =>
    `<div class="kpi ${cls}"><span>${label}</span><strong>${val}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;

  $('#kpis').innerHTML = [
    kpi('Pacientes cadastrados', st.total),
    kpi('Em atendimento (ativos)', st.ativo, 'ativo'),
    kpi('Na fila', st.fila, 'fila'),
    kpi('Desligados (inativos)', st.desligado, 'desligado'),
    kpi('Terapias em andamento', emAtend.length, 'ativo', 'soma de todas as áreas'),
    kpi('Terapias aguardando', emFila.length, 'fila', 'inclui ativos esperando outra área'),
    kpi('Espera média na fila', esperaMedia + ' dias', 'fila'),
    kpi('Triagens no mês', triagensMes),
    kpi('Desligamentos no mês', desligMes, 'desligado'),
    kpi('Profissionais', db.profissionais.length),
    kpi('Ativos sem CID', semCid, semCid ? 'fila' : '', `a partir de ${CID_IDADE_MIN} anos`),
  ].join('');

  // Por área
  const areaRows = AREAS.map(a => ({
    label: a,
    ativo: emAtend.filter(t => t.area === a).length,
    fila: emFila.filter(t => t.area === a).length,
  }));
  $('#dash-areas').innerHTML = barras(areaRows, ['ativo', 'fila']);

  // Por cidade
  const cidadeRows = [...CIDADES, ''].map(c => {
    const l = pacs.filter(p => (p.cidadeAtendimento || '') === c);
    const s = contarStatus(l);
    return { label: c || 'Não informada', ...s };
  }).filter(r => r.label !== 'Não informada' || r.total);
  $('#dash-cidades').innerHTML = barras(cidadeRows, ['ativo', 'fila', 'desligado']);

  // Por profissional
  const todasTer = pacs.flatMap(p => (p.terapias || []).map(t => ({ ...t, desl: !!p.dataDesligamento })));
  const profRows = db.profissionais.map(pr => {
    const l = todasTer.filter(t => t.profissionalId === pr.id);
    return {
      nome: pr.nome, area: pr.area,
      atend: l.filter(t => t.status === 'atendimento' && !t.desl).length,
      fila: l.filter(t => t.status === 'fila' && !t.desl).length,
      enc: l.filter(t => t.status === 'encerrada' || t.desl).length,
    };
  });
  const semProf = todasTer.filter(t => !t.profissionalId || !byId('profissionais', t.profissionalId));
  if (semProf.length) profRows.push({
    nome: 'Sem profissional definido', area: '—', sem: true,
    atend: semProf.filter(t => t.status === 'atendimento' && !t.desl).length,
    fila: semProf.filter(t => t.status === 'fila' && !t.desl).length,
    enc: semProf.filter(t => t.status === 'encerrada' || t.desl).length,
  });
  profRows.sort((a, b) => (a.sem - b.sem) || (b.atend - a.atend) || a.nome.localeCompare(b.nome));
  const maxAt = Math.max(1, ...profRows.map(r => r.atend + r.fila));
  $('#dash-prof').innerHTML = profRows.length ? profRows.map(r => `
    <tr>
      <td><strong>${esc(r.nome)}</strong></td>
      <td>${esc(r.area)}</td>
      <td>${r.atend}</td><td>${r.fila}</td><td>${r.enc}</td><td>${r.atend + r.fila + r.enc}</td>
      <td><div class="mini-track">
        <div class="seg ativo" style="width:${r.atend / maxAt * 100}%"></div>
        <div class="seg fila" style="width:${r.fila / maxAt * 100}%"></div>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="7" class="empty">Cadastre profissionais na aba Cadastros.</td></tr>`;

  // Por convênio
  const convIds = [...db.convenios.map(c => c.id), ''];
  $('#dash-conv-tab').innerHTML = linhasStatus(convIds.map(id => ({
    label: id ? convLabel(byId('convenios', id)) : 'Sem convênio',
    l: pacs.filter(p => (p.convenioId || '') === id),
  })).filter(r => r.l.length || r.label !== 'Sem convênio'));

  // Por faixa etária
  $('#dash-faixa-tab').innerHTML = linhasStatus(['0-12', '13+', ''].map(f => ({
    label: FAIXA_LABEL[f], l: pacs.filter(p => faixa(p) === f),
  })).filter(r => r.l.length || r.label !== FAIXA_LABEL['']));

  // Maior espera
  const espera = emFila.map(t => ({ t, dias: diasDesde(t.dataFila || t.p.dataTriagem) ?? 0 }))
    .sort((a, b) => b.dias - a.dias).slice(0, 10);
  $('#dash-espera').innerHTML = espera.length ? espera.map(({ t, dias }) => `
    <tr>
      <td>${esc(t.p.nome)}</td><td>${esc(t.area)}</td><td>${esc(t.p.cidadeAtendimento || '')}</td>
      <td>${fmtData(t.dataFila || t.p.dataTriagem)}</td><td><strong>${dias}</strong></td>
    </tr>`).join('') : `<tr><td colspan="5" class="empty">Ninguém aguardando na fila.</td></tr>`;

  // Últimos 12 meses
  const meses = [];
  const d = new Date(); d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    meses.push({
      key,
      label: m.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      tri: pacs.filter(p => (p.dataTriagem || '').startsWith(key)).length,
      des: pacs.filter(p => (p.dataDesligamento || '').startsWith(key)).length,
    });
  }
  const maxM = Math.max(1, ...meses.map(m => Math.max(m.tri, m.des)));
  $('#dash-meses').innerHTML = meses.map(m => `
    <div class="month" title="${m.label}: ${m.tri} triagem(ns), ${m.des} desligamento(s)">
      <div class="cols">
        <div class="col seg primary" style="height:${m.tri / maxM * 100}%"></div>
        <div class="col seg desligado" style="height:${m.des / maxM * 100}%"></div>
      </div>
      <span>${m.tri}/${m.des}</span>
      <span>${m.label}</span>
    </div>`).join('');
}

function barras(rows, keys) {
  const max = Math.max(1, ...rows.map(r => keys.reduce((s, k) => s + r[k], 0)));
  return rows.map(r => {
    const tot = keys.reduce((s, k) => s + r[k], 0);
    const tip = keys.map(k => `${r[k]} ${k === 'ativo' ? 'em atendimento' : k === 'fila' ? 'na fila' : 'desligado(s)'}`).join(', ');
    return `<div class="bar-row" title="${esc(r.label)}: ${tip}">
      <span>${esc(r.label)}</span>
      <div class="bar-track">${keys.map(k => `<div class="seg ${k}" style="width:${r[k] / max * 100}%"></div>`).join('')}</div>
      <span class="num">${tot}</span>
    </div>`;
  }).join('');
}

function linhasStatus(rows) {
  if (!rows.length) return `<tr><td colspan="5" class="empty">Sem dados.</td></tr>`;
  return rows.map(r => {
    const s = contarStatus(r.l);
    return `<tr><td>${esc(r.label)}</td><td>${s.ativo}</td><td>${s.fila}</td><td>${s.desligado}</td><td><strong>${s.total}</strong></td></tr>`;
  }).join('');
}

/* =========================================================
   PACIENTES — lista
   ========================================================= */

let statusAtual = 'todos';

$$('#tabs-status .tab').forEach(t => t.addEventListener('click', () => {
  statusAtual = t.dataset.status;
  $$('#tabs-status .tab').forEach(x => x.classList.toggle('active', x === t));
  renderLista();
}));
['#busca', '#filtro-cidade', '#filtro-conv', '#filtro-area', '#filtro-prof'].forEach(s =>
  $(s).addEventListener('input', renderLista));

function renderLista() {
  const q = $('#busca').value.trim().toLowerCase();
  const cid = $('#filtro-cidade').value, conv = $('#filtro-conv').value;
  const area = $('#filtro-area').value, prof = $('#filtro-prof').value;

  const base = db.pacientes.filter(p =>
    (!q || [p.nome, p.responsavel, p.contato, ...cidsDe(p)].some(v => (v || '').toLowerCase().includes(q))) &&
    (!cid || p.cidadeAtendimento === cid) &&
    (!conv || p.convenioId === conv) &&
    (!area || (p.terapias || []).some(t => t.area === area)) &&
    (!prof || (p.terapias || []).some(t => t.profissionalId === prof)));

  const c = contarStatus(base);
  $('#ct-todos').textContent = c.total;
  $('#ct-fila').textContent = c.fila;
  $('#ct-ativo').textContent = c.ativo;
  $('#ct-desligado').textContent = c.desligado;

  let lista = statusAtual === 'todos' ? base : base.filter(p => statusGeral(p) === statusAtual);
  lista = [...lista].sort((a, b) => statusAtual === 'fila'
    ? (a.dataTriagem || '').localeCompare(b.dataTriagem || '')
    : a.nome.localeCompare(b.nome));

  $('#vazio').hidden = lista.length > 0;
  $('#lista').innerHTML = lista.map(p => {
    const s = statusGeral(p);
    const i = idade(p.dataNascimento);
    const faltaCid = i !== null && i >= CID_IDADE_MIN && !cidsDe(p).length && s !== 'desligado';
    const chips = (p.terapias || []).map(t => {
      const datas = [
        t.dataFila && `fila ${fmtData(t.dataFila)}`,
        t.dataInicio && `início ${fmtData(t.dataInicio)}`,
        t.dataFim && `fim ${fmtData(t.dataFim)}`,
      ].filter(Boolean).join(' · ');
      return `<span class="chip ${t.status}" title="${esc(TSTATUS_LABEL[t.status])}">
        ${esc(t.area)}${t.profissionalId ? ' — ' + esc(profNome(t.profissionalId)) : ''}
        <small>${esc(TSTATUS_LABEL[t.status])}${datas ? ' · ' + datas : ''}</small></span>`;
    }).join('');
    return `<tr>
      <td><strong>${esc(p.nome)}</strong><div class="sub">${esc(p.responsavel || '')}</div></td>
      <td>${i !== null ? i + ' anos' : '—'}<div class="sub">${cidsDe(p).length ? 'CID ' + esc(cidsDe(p).join(', ')) : faltaCid ? '<span class="badge fila">sem CID</span>' : ''}</div></td>
      <td>${esc(p.cidadeAtendimento || '—')}<div class="sub">${esc(convNome(p.convenioId))}${p.coordenadorId ? ' · ' + esc(coordNome(p.coordenadorId)) : ''}</div></td>
      <td>${esc(p.contato || '')}<div class="sub">${esc(p.formaContato || '')}</div></td>
      <td>${fmtData(p.dataTriagem)}${statusAtual === 'fila' && p.dataTriagem ? `<div class="sub">${diasDesde(p.dataTriagem)} dias</div>` : ''}</td>
      <td><div class="chips">${chips || '<span class="sub">—</span>'}</div></td>
      <td><span class="badge ${s}">${STATUS_LABEL[s]}</span>${p.dataDesligamento ? `<div class="sub">${fmtData(p.dataDesligamento)}</div>` : ''}</td>
      <td class="actions">
        <button class="btn sm" data-edit="${p.id}">Editar</button>
        <button class="btn sm danger" data-del="${p.id}">Excluir</button>
      </td>
    </tr>`;
  }).join('');
}

$('#lista').addEventListener('click', e => {
  const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (ed) abrirModal(byId('pacientes', ed.dataset.edit));
  if (del) {
    const p = byId('pacientes', del.dataset.del);
    if (confirm(`Excluir o cadastro de ${p.nome}? Essa ação não pode ser desfeita.\n\nDica: para manter o histórico, use "Data do desligamento" em vez de excluir.`)) {
      db.pacientes = db.pacientes.filter(x => x.id !== p.id);
      save();
    }
  }
});

/* =========================================================
   PACIENTES — modal
   ========================================================= */

const modal = $('#modal');
const formPac = $('#form-pac');

$('#btn-novo').addEventListener('click', () => abrirModal());
$$('[data-close]', modal).forEach(b => b.addEventListener('click', () => modal.close()));
$('#add-terapia').addEventListener('click', () => addTerapia({ status: 'fila', dataFila: hojeISO() }));

function abrirModal(p) {
  formPac.reset();
  $('#terapias').innerHTML = '';
  $('#modal-titulo').textContent = p ? 'Editar paciente' : 'Nova triagem';
  const dados = p || { dataTriagem: hojeISO(), terapias: [] };
  ['id', 'nome', 'dataNascimento', 'responsavel', 'formaContato', 'contato', 'dataTriagem',
    'cidadeMora', 'cidadeAtendimento', 'dataDesligamento', 'motivoDesligamento', 'obs']
    .forEach(k => { formPac.elements[k].value = dados[k] || ''; });
  cidsAtuais = [...cidsDe(dados)];
  $('#cid-input').value = '';
  renderCids();
  atualizarIdade();
  atualizarLocalidade(dados.coordenadorId, dados.convenioId);
  (dados.terapias || []).forEach(addTerapia);
  modal.showModal();
}

function atualizarIdade() {
  const i = idade(formPac.elements.dataNascimento.value);
  formPac.elements.idade.value = i === null ? '' : `${i} anos (${FAIXA_LABEL[i <= 12 ? '0-12' : '13+']})`;
  const obrig = i !== null && i >= CID_IDADE_MIN;
  $('#cid-hint').textContent = obrig ? '(obrigatório — pode ter mais de um)' : `(obrigatório a partir de ${CID_IDADE_MIN} anos — pode ter mais de um)`;
}

const cidObrigatorio = () => {
  const i = idade(formPac.elements.dataNascimento.value);
  return i !== null && i >= CID_IDADE_MIN && !formPac.elements.dataDesligamento.value;
};

/* ---- CIDs: vários por paciente ---- */
let cidsAtuais = [];
const cidInput = $('#cid-input');

function renderCids() {
  $$('.tag', $('#cid-box')).forEach(t => t.remove());
  cidsAtuais.forEach((c, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${esc(c)}<button type="button" title="Remover" data-i="${i}">×</button>`;
    $('#cid-box').insertBefore(tag, cidInput);
  });
  $('#cid-box').classList.remove('invalid');
}

function addCids(texto) {
  texto.split(/[,;\s]+/).map(c => c.trim().toUpperCase()).filter(Boolean)
    .forEach(c => { if (!cidsAtuais.includes(c)) cidsAtuais.push(c); });
  cidInput.value = '';
  renderCids();
}

cidInput.addEventListener('keydown', e => {
  if (['Enter', ',', ';', 'Tab'].includes(e.key) && cidInput.value.trim()) {
    e.preventDefault();
    addCids(cidInput.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
  } else if (e.key === 'Backspace' && !cidInput.value && cidsAtuais.length) {
    cidsAtuais.pop();
    renderCids();
  }
});
cidInput.addEventListener('blur', () => { if (cidInput.value.trim()) addCids(cidInput.value); });
$('#cid-box').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (b) { cidsAtuais.splice(+b.dataset.i, 1); renderCids(); }
  cidInput.focus();
});

function atualizarLocalidade(coordSel, convSel) {
  const f = formPac.elements;
  const cidade = f.cidadeAtendimento.value;
  const i = idade(f.dataNascimento.value);
  const fx = i === null ? '' : (i <= 12 ? '0-12' : '13+');
  const curCoord = coordSel !== undefined ? coordSel || '' : f.coordenadorId.value;
  const curConv = convSel !== undefined ? convSel || '' : f.convenioId.value;

  // Coordenador: os da cidade primeiro
  const daCidade = db.coordenadores.filter(c => c.cidade === cidade);
  const outros = db.coordenadores.filter(c => c.cidade !== cidade);
  const fmtCoord = c => `${c.nome} — ${c.cidade}`;
  f.coordenadorId.innerHTML = '<option value="">—</option>' + (cidade
    ? grupo(`Coordenação de ${cidade}`, daCidade, fmtCoord) + grupo('Outras cidades', outros, fmtCoord)
    : grupo('Coordenadores', db.coordenadores, fmtCoord));
  f.coordenadorId.value = curCoord;
  if (!f.coordenadorId.value && daCidade.length === 1) f.coordenadorId.value = daCidade[0].id;

  // Convênio: compatíveis com cidade + faixa etária primeiro
  const compat = db.convenios.filter(c => (!c.cidade || c.cidade === cidade) && (!c.faixa || !fx || c.faixa === fx));
  const resto = db.convenios.filter(c => !compat.includes(c));
  f.convenioId.innerHTML = '<option value="">—</option>' +
    grupo('Indicados para a cidade e idade', compat, convLabel) +
    grupo('Outros convênios', resto, convLabel);
  f.convenioId.value = curConv;
  if (!f.convenioId.value && compat.length === 1 && cidade && fx) f.convenioId.value = compat[0].id;

  const escolhido = byId('convenios', f.convenioId.value);
  let hint = '';
  if (!db.convenios.length) hint = 'Nenhum convênio cadastrado ainda — cadastre na aba Cadastros.';
  else if (cidade && fx && !compat.length) hint = `Nenhum convênio cadastrado para ${cidade} / ${FAIXA_LABEL[fx]}.`;
  else if (escolhido && !compat.includes(escolhido)) hint = '⚠ O convênio selecionado não corresponde à cidade/idade do paciente.';
  $('#conv-hint').textContent = hint;
}

function grupo(label, itens, fmt) {
  if (!itens.length) return '';
  return `<optgroup label="${esc(label)}">${itens.map(i => `<option value="${i.id}">${esc(fmt(i))}</option>`).join('')}</optgroup>`;
}

formPac.elements.dataNascimento.addEventListener('input', () => { atualizarIdade(); atualizarLocalidade(); });
formPac.elements.dataDesligamento.addEventListener('input', atualizarIdade);
formPac.elements.cidadeAtendimento.addEventListener('change', () => atualizarLocalidade());
formPac.elements.convenioId.addEventListener('change', () => atualizarLocalidade());
formPac.elements.cidadeMora.addEventListener('change', () => {
  if (!formPac.elements.cidadeAtendimento.value) {
    formPac.elements.cidadeAtendimento.value = formPac.elements.cidadeMora.value;
    atualizarLocalidade();
  }
});

function addTerapia(t) {
  const row = $('#tpl-terapia').content.firstElementChild.cloneNode(true);
  const f = k => $(`[data-f="${k}"]`, row);
  fillSelect(f('area'), optAreas(), 'Selecione…');
  f('area').required = true;
  f('area').value = t.area || '';
  f('status').value = t.status || 'fila';
  ['dataFila', 'dataInicio', 'dataFim'].forEach(k => { f(k).value = t[k] || ''; });

  const fillProf = sel => {
    const area = f('area').value;
    const lista = db.profissionais.filter(p => !area || p.area === area || p.id === sel);
    fillSelect(f('profissionalId'), lista.sort((a, b) => a.nome.localeCompare(b.nome))
      .map(p => ({ value: p.id, label: p.nome })), lista.length ? '—' : 'Nenhum nesta área');
    f('profissionalId').value = sel || '';
  };
  fillProf(t.profissionalId);
  f('area').addEventListener('change', () => fillProf(''));

  // Preenche datas automaticamente ao mudar a situação
  f('status').addEventListener('change', () => {
    if (f('status').value === 'atendimento' && !f('dataInicio').value) f('dataInicio').value = hojeISO();
    if (f('status').value === 'encerrada' && !f('dataFim').value) f('dataFim').value = hojeISO();
  });
  $('.remove', row).addEventListener('click', () => row.remove());
  $('#terapias').appendChild(row);
}

formPac.addEventListener('submit', e => {
  e.preventDefault();
  const f = formPac.elements;
  if (cidInput.value.trim()) addCids(cidInput.value);
  if (cidObrigatorio() && !cidsAtuais.length) {
    $('#cid-box').classList.add('invalid');
    cidInput.focus();
    alert(`Informe pelo menos um CID (obrigatório a partir de ${CID_IDADE_MIN} anos).`);
    return;
  }
  const p = {
    id: f.id.value || uid(),
    nome: f.nome.value.trim(),
    dataNascimento: f.dataNascimento.value,
    cids: [...cidsAtuais],
    responsavel: f.responsavel.value.trim(),
    formaContato: f.formaContato.value,
    contato: f.contato.value.trim(),
    dataTriagem: f.dataTriagem.value,
    cidadeMora: f.cidadeMora.value,
    cidadeAtendimento: f.cidadeAtendimento.value,
    coordenadorId: f.coordenadorId.value,
    convenioId: f.convenioId.value,
    dataDesligamento: f.dataDesligamento.value,
    motivoDesligamento: f.motivoDesligamento.value.trim(),
    obs: f.obs.value.trim(),
    terapias: $$('.terapia-row', formPac).map(r => {
      const g = k => $(`[data-f="${k}"]`, r).value;
      return {
        area: g('area'), profissionalId: g('profissionalId'), status: g('status'),
        dataFila: g('dataFila'), dataInicio: g('dataInicio'), dataFim: g('dataFim'),
      };
    }),
  };
  const idx = db.pacientes.findIndex(x => x.id === p.id);
  if (idx >= 0) {
    db.pacientes[idx] = { ...db.pacientes[idx], ...p };
    delete db.pacientes[idx].cid;
  }
  else db.pacientes.push({ ...p, criadoEm: new Date().toISOString() });
  modal.close();
  save();
});

/* =========================================================
   CADASTROS (profissionais, coordenadores, convênios)
   ========================================================= */

function crud({ form, lista, campos, linha, onDelete }) {
  const frm = $(form);
  const cancelar = $('.cancelar', frm);
  const limpar = () => { frm.reset(); frm.elements.id.value = ''; cancelar.hidden = true; };
  cancelar.addEventListener('click', limpar);

  frm.addEventListener('submit', e => {
    e.preventDefault();
    const item = { id: frm.elements.id.value || uid() };
    campos.forEach(k => { item[k] = frm.elements[k].value.trim(); });
    const i = db[lista].findIndex(x => x.id === item.id);
    if (i >= 0) db[lista][i] = item; else db[lista].push(item);
    limpar();
    save();
  });

  const tbody = frm.closest('.card').querySelector('tbody');
  tbody.addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) {
      const item = byId(lista, ed.dataset.edit);
      frm.elements.id.value = item.id;
      campos.forEach(k => { frm.elements[k].value = item[k] || ''; });
      cancelar.hidden = false;
      frm.elements[campos[0]].focus();
    }
    if (del) {
      const item = byId(lista, del.dataset.del);
      if (!confirm(`Excluir "${item.nome}"?`)) return;
      db[lista] = db[lista].filter(x => x.id !== item.id);
      onDelete(item.id);
      save();
    }
  });

  return () => {
    const itens = [...db[lista]].sort((a, b) => a.nome.localeCompare(b.nome));
    tbody.innerHTML = itens.length ? itens.map(i => `<tr>${linha(i)}
      <td class="actions"><button class="btn sm" data-edit="${i.id}">Editar</button>
      <button class="btn sm danger" data-del="${i.id}">Excluir</button></td></tr>`).join('')
      : `<tr><td colspan="9" class="empty">Nenhum cadastro ainda.</td></tr>`;
  };
}

const ativos = () => db.pacientes.filter(p => !p.dataDesligamento);

const renderProfs = crud({
  form: '#form-prof', lista: 'profissionais', campos: ['nome', 'area', 'registro', 'contato'],
  linha: p => {
    const ts = ativos().flatMap(x => x.terapias || []).filter(t => t.profissionalId === p.id);
    return `<td><strong>${esc(p.nome)}</strong></td><td>${esc(p.area)}</td><td>${esc(p.registro)}</td><td>${esc(p.contato)}</td>
      <td>${ts.filter(t => t.status === 'atendimento').length}</td><td>${ts.filter(t => t.status === 'fila').length}</td>`;
  },
  onDelete: id => db.pacientes.forEach(p => (p.terapias || []).forEach(t => { if (t.profissionalId === id) t.profissionalId = ''; })),
});

const renderCoords = crud({
  form: '#form-coord', lista: 'coordenadores', campos: ['nome', 'cidade', 'contato'],
  linha: c => `<td><strong>${esc(c.nome)}</strong></td><td>${esc(c.cidade)}</td><td>${esc(c.contato)}</td>
    <td>${ativos().filter(p => p.coordenadorId === c.id).length}</td>`,
  onDelete: id => db.pacientes.forEach(p => { if (p.coordenadorId === id) p.coordenadorId = ''; }),
});

const renderConvs = crud({
  form: '#form-conv', lista: 'convenios', campos: ['nome', 'cidade', 'faixa'],
  linha: c => `<td><strong>${esc(c.nome)}</strong></td><td>${esc(c.cidade || 'Todas')}</td><td>${esc(c.faixa ? FAIXA_LABEL[c.faixa] : 'Todas')}</td>
    <td>${ativos().filter(p => p.convenioId === c.id).length}</td>`,
  onDelete: id => db.pacientes.forEach(p => { if (p.convenioId === id) p.convenioId = ''; }),
});

/* =========================================================
   RELATÓRIOS
   ========================================================= */

const formRel = $('#form-rel');
formRel.addEventListener('input', renderRelatorio);
formRel.addEventListener('reset', () => setTimeout(renderRelatorio));

const COLUNAS = [
  'Paciente', 'Nascimento', 'Idade', 'Faixa etária', 'CIDs', 'Responsável', 'Forma de contato', 'Contato',
  'Cidade onde mora', 'Cidade de atendimento', 'Coordenador', 'Convênio', 'Triagem',
  'Área', 'Profissional', 'Situação na terapia', 'Entrada na fila', 'Início', 'Fim',
  'Status geral', 'Desligamento', 'Motivo do desligamento',
];

function dadosRelatorio() {
  const f = Object.fromEntries(new FormData(formRel));
  const q = (f.busca || '').trim().toLowerCase();
  const naFaixa = v => (!f.de || (v && v >= f.de)) && (!f.ate || (v && v <= f.ate));
  const campoTerapia = ['dataFila', 'dataInicio', 'dataFim'].includes(f.campo);
  const filtraTerapia = f.area || f.prof || f.tstatus || (campoTerapia && (f.de || f.ate));

  const linhas = [];
  const pacs = new Set();

  db.pacientes.forEach(p => {
    const s = statusGeral(p);
    if (f.status && s !== f.status) return;
    if (f.cidade && p.cidadeAtendimento !== f.cidade) return;
    if (f.cidadeMora && p.cidadeMora !== f.cidadeMora) return;
    if (f.conv && p.convenioId !== f.conv) return;
    if (f.coord && p.coordenadorId !== f.coord) return;
    if (f.faixa && faixa(p) !== f.faixa) return;
    if (q && ![p.nome, p.responsavel, p.contato, ...cidsDe(p)].some(v => (v || '').toLowerCase().includes(q))) return;
    if (!campoTerapia && (f.de || f.ate) && !naFaixa(p[f.campo])) return;

    let ters = (p.terapias || []).filter(t =>
      (!f.area || t.area === f.area) &&
      (!f.prof || t.profissionalId === f.prof) &&
      (!f.tstatus || t.status === f.tstatus) &&
      (!campoTerapia || !(f.de || f.ate) || naFaixa(t[f.campo])));
    if (!ters.length) {
      if (filtraTerapia) return;
      ters = [null];
    }

    const i = idade(p.dataNascimento);
    ters.forEach(t => {
      pacs.add(p.id);
      linhas.push([
        p.nome, fmtData(p.dataNascimento), i ?? '', FAIXA_LABEL[faixa(p)] === FAIXA_LABEL[''] ? '' : FAIXA_LABEL[faixa(p)],
        cidsDe(p).join(', '), p.responsavel || '', p.formaContato || '', p.contato || '',
        p.cidadeMora || '', p.cidadeAtendimento || '', coordNome(p.coordenadorId), convNome(p.convenioId), fmtData(p.dataTriagem),
        t ? t.area : '', t ? profNome(t.profissionalId) : '', t ? TSTATUS_LABEL[t.status] : '',
        t ? fmtData(t.dataFila) : '', t ? fmtData(t.dataInicio) : '', t ? fmtData(t.dataFim) : '',
        STATUS_LABEL[s], fmtData(p.dataDesligamento), p.motivoDesligamento || '',
      ]);
    });
  });

  linhas.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[13]).localeCompare(String(b[13])));
  return { linhas, totalPac: pacs.size, filtros: f };
}

function resumoFiltros(f) {
  const partes = [];
  if (f.status) partes.push('Status: ' + STATUS_LABEL[f.status]);
  if (f.cidade) partes.push('Atendimento: ' + f.cidade);
  if (f.cidadeMora) partes.push('Mora em: ' + f.cidadeMora);
  if (f.conv) partes.push('Convênio: ' + convNome(f.conv));
  if (f.coord) partes.push('Coordenador: ' + coordNome(f.coord));
  if (f.faixa) partes.push('Faixa: ' + FAIXA_LABEL[f.faixa]);
  if (f.area) partes.push('Área: ' + f.area);
  if (f.prof) partes.push('Profissional: ' + profNome(f.prof));
  if (f.tstatus) partes.push('Situação: ' + TSTATUS_LABEL[f.tstatus]);
  if (f.de || f.ate) {
    const campo = formRel.elements.campo.selectedOptions[0].textContent;
    partes.push(`${campo}: ${f.de ? fmtData(f.de) : '…'} a ${f.ate ? fmtData(f.ate) : '…'}`);
  }
  if (f.busca) partes.push('Busca: ' + f.busca);
  return partes.length ? partes.join(' · ') : 'Sem filtros (todos os registros)';
}

function renderRelatorio() {
  const { linhas, totalPac } = dadosRelatorio();
  $('#rel-thead').innerHTML = `<tr>${COLUNAS.map(c => `<th>${c}</th>`).join('')}</tr>`;
  $('#rel-body').innerHTML = linhas.map(l => `<tr>${l.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  $('#rel-count').textContent = linhas.length;
  $('#rel-pac').textContent = totalPac;
  $('#rel-vazio').hidden = linhas.length > 0;
}

function nomeArquivo(ext) {
  return `relatorio-atendimentos-${hojeISO()}.${ext}`;
}

function baixar(conteudo, tipo, nome) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$$('[data-exp]').forEach(b => b.addEventListener('click', () => {
  const { linhas, totalPac, filtros } = dadosRelatorio();
  if (!linhas.length) return alert('Nenhum registro para exportar com esses filtros.');
  const titulo = 'Relatório de Atendimentos';
  const sub = `${resumoFiltros(filtros)} — ${linhas.length} registro(s), ${totalPac} paciente(s) — gerado em ${fmtData(hojeISO())}`;

  switch (b.dataset.exp) {
    case 'csv': {
      const cel = v => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [COLUNAS, ...linhas].map(l => l.map(cel).join(';')).join('\r\n');
      baixar('﻿' + csv, 'text/csv;charset=utf-8', nomeArquivo('csv'));
      break;
    }
    case 'xlsx': {
      if (!window.XLSX) return alert('Biblioteca do Excel não carregou. Verifique a internet e tente de novo.');
      const ws = XLSX.utils.aoa_to_sheet([[titulo], [sub], [], COLUNAS, ...linhas]);
      ws['!cols'] = COLUNAS.map((c, i) => ({ wch: Math.min(40, Math.max(c.length, ...linhas.map(l => String(l[i]).length)) + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
      XLSX.writeFile(wb, nomeArquivo('xlsx'));
      break;
    }
    case 'doc': {
      const tabela = `<table border="1" cellspacing="0" cellpadding="3" style="border-collapse:collapse;font-size:8pt;font-family:Arial">
        <tr>${COLUNAS.map(c => `<th style="background:#e8eef9">${c}</th>`).join('')}</tr>
        ${linhas.map(l => `<tr>${l.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`;
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
        <head><meta charset="utf-8"><style>
          @page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 1.5cm; }
          div.Section1 { page: Section1; }
        </style></head>
        <body><div class="Section1"><h2 style="font-family:Arial">${titulo}</h2>
        <p style="font-family:Arial;font-size:9pt;color:#555">${esc(sub)}</p>${tabela}</div></body></html>`;
      baixar('﻿' + html, 'application/msword', nomeArquivo('doc'));
      break;
    }
    case 'pdf': {
      if (!window.jspdf) return alert('Biblioteca de PDF não carregou. Verifique a internet e tente de novo.');
      const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
      doc.setFontSize(16);
      doc.text(titulo, 30, 36);
      doc.setFontSize(9);
      doc.setTextColor(90);
      doc.text(doc.splitTextToSize(sub, 1100), 30, 54);
      doc.autoTable({
        head: [COLUNAS], body: linhas, startY: 72, margin: { left: 30, right: 30 },
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [47, 111, 222] },
        alternateRowStyles: { fillColor: [245, 247, 251] },
      });
      doc.save(nomeArquivo('pdf'));
      break;
    }
  }
}));

/* =========================================================
   BACKUP
   ========================================================= */

$('#btn-backup').addEventListener('click', () => {
  baixar(JSON.stringify(db, null, 2), 'application/json', `backup-atendimentos-${hojeISO()}.json`);
});

$('#input-restore').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.pacientes)) throw new Error();
    if (!confirm(`Restaurar backup com ${data.pacientes.length} paciente(s)? Os dados atuais deste navegador serão substituídos.`)) return;
    db = { pacientes: [], profissionais: [], coordenadores: [], convenios: [], ...data };
    save();
  } catch {
    alert('Arquivo de backup inválido.');
  } finally {
    e.target.value = '';
  }
});

/* ---------------- Render geral ---------------- */

function renderAll() {
  refreshSelects();
  renderDashboard();
  renderLista();
  renderProfs();
  renderCoords();
  renderConvs();
  renderRelatorio();
}

renderAll();
