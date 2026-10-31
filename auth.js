/* =========================================================
   Login por CPF e senha (acesso único).
   A credencial não fica escrita no código: guardamos apenas
   o hash SHA-256 de "apai-controle:<cpf>:<senha>".
   ========================================================= */

const AUTH_HASH = '02498294b7b6308aa2e8f17b786a4a91813c190e8e1fcc2bab7dd3c5548248b8';
const AUTH_KEY = 'apai-auth';

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function setSessao(ok) {
  try {
    if (ok) sessionStorage.setItem(AUTH_KEY, '1');
    else sessionStorage.removeItem(AUTH_KEY);
  } catch (e) { /* sem sessionStorage: vale só até recarregar a página */ }
  document.documentElement.classList.toggle('locked', !ok);
}

const formLogin = document.getElementById('form-login');
const cpfInput = formLogin.elements.cpf;

// Máscara 000.000.000-00
cpfInput.addEventListener('input', () => {
  const d = cpfInput.value.replace(/\D/g, '').slice(0, 11);
  cpfInput.value = d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
});

formLogin.addEventListener('submit', async e => {
  e.preventDefault();
  const cpf = cpfInput.value.replace(/\D/g, '');
  const senha = formLogin.elements.senha.value;
  const ok = (await sha256(`apai-controle:${cpf}:${senha}`)) === AUTH_HASH;
  document.getElementById('login-erro').hidden = ok;
  if (ok) {
    formLogin.reset();
    setSessao(true);
  } else {
    formLogin.elements.senha.value = '';
    formLogin.elements.senha.focus();
  }
});

document.getElementById('btn-sair').addEventListener('click', () => setSessao(false));
