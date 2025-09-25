import { firebaseConfig } from './firebase.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, runTransaction, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function byId(id){ return document.getElementById(id); }
function showMsg(elId, txt, cls){ const el=byId(elId); if(!el) return; el.className=cls||''; el.innerHTML = txt; }

// ===== Agendamento =====
window.agendarExame = async () => {
  const data = byId('data')?.value;
  const nome = byId('nome')?.value?.trim();
  const cpf  = byId('cpf')?.value?.trim();
  const exame= byId('exame')?.value;
  const aceite = byId('lgpdAceite')?.checked;
  const msg  = 'msg';

  if(!data || !nome || !cpf){ showMsg(msg, "Preencha todos os campos.", "text-danger"); return; }
  if(!aceite){ showMsg(msg, "Você precisa aceitar o termo LGPD para continuar.", "text-danger"); return; }

  const LIMIT = 25;
  const dayRef = doc(db, "examDays", data);
  try {
    const senha = await runTransaction(db, async (tx) => {
      const daySnap = await tx.get(dayRef);
      let limit = LIMIT, taken = 0;
      if(daySnap.exists()){
        const d = daySnap.data();
        limit = d.limit ?? LIMIT;
        taken = d.taken ?? 0;
      } else {
        tx.set(dayRef, { limit: LIMIT, taken: 0 });
      }
      if(taken >= limit){ throw new Error("Limite diário atingido. Tente outra data."); }
      const queueNumber = taken + 1;
      tx.update(dayRef, { taken: queueNumber });
      const exameRef = doc(collection(db, "exames"));
      tx.set(exameRef, { nome, cpf, exame, data, senha: queueNumber, status: "confirmado", criadoEm: serverTimestamp() });
      return queueNumber;
    });

    showMsg(msg, `✅ Agendado! <strong>Sua senha: ${senha}</strong>`, "text-success");
    await calcVagasRestantes();
  } catch (e) {
    showMsg(msg, e.message, "text-danger");
  }
};

// Vagas restantes
async function calcVagasRestantes(){
  const dataInput = byId('data');
  const span = byId('vagasRestantes');
  if(!dataInput || !span) return;
  const data = dataInput.value;
  const LIMIT = 25;
  const dayRef = doc(db, "examDays", data);
  const snap = await getDoc(dayRef);
  if(snap.exists()){
    const d = snap.data();
    const taken = d.taken ?? 0;
    span.textContent = Math.max(0, (d.limit ?? LIMIT) - taken);
  } else {
    span.textContent = LIMIT;
  }
}

window.addEventListener('load', ()=>{
  const dataInput = byId('data');
  if(dataInput){
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    dataInput.value = `${yyyy}-${mm}-${dd}`;
    dataInput.addEventListener('change', calcVagasRestantes);
    calcVagasRestantes();
  }
  listarMedicamentos();
});

// ===== Minhas Senhas =====
window.buscarSenhas = async () => {
  const cpf = byId('cpfBusca')?.value?.trim();
  const box = byId('listaSenhas');
  if(!box) return;
  if(!cpf){ box.textContent = "Informe o CPF."; return; }
  try{
    const qy = query(collection(db, "exames"), where("cpf","==",cpf), orderBy("data","desc"));
    const snap = await getDocs(qy);
    if(snap.empty){ box.textContent = "Nenhum agendamento encontrado."; return; }
    box.innerHTML = [...snap.docs].map(d=>{
      const x=d.data();
      return `<div class="border rounded p-2 mb-2 bg-white">
        <div><strong>Data:</strong> ${x.data} — <strong>Senha:</strong> ${x.senha}</div>
        <div><strong>Exame:</strong> ${x.exame} — <strong>Status:</strong> ${x.status}</div>
      </div>`;
    }).join("");
  }catch(e){
    box.textContent = e.message;
  }
};

// ===== Medicamentos (lista pública) =====
window.listarMedicamentos = async () => {
  const termo = (byId('buscaMed')?.value || "").toLowerCase();
  const box = byId('listaMed');
  if(!box) return;
  const qy = query(collection(db,"medicamentos"), orderBy("nome"));
  const snap = await getDocs(qy);
  const itens = [...snap.docs].map(d=>d.data()).filter(x=> ((x.nome||'')+" "+(x.dosagem||'')).toLowerCase().includes(termo));
  if(!itens.length){ box.textContent = "Nenhum medicamento encontrado."; return; }
  box.innerHTML = itens.map(x=>`
    <div class="border rounded p-2 mb-2 bg-white">
      <div><strong>${x.nome}</strong> ${x.dosagem?`<span class="badge bg-light text-dark ms-2">${x.dosagem}</span>`:''}</div>
      <div>Disponível: <strong>${x.disponivel ? "Sim" : "Não"}</strong> ${x.quantidade?`| Qtde: ${x.quantidade}`:''}</div>
      <small class="text-muted">Atualizado em: ${x.atualizadoEm?.toDate? x.atualizadoEm.toDate().toLocaleString(): '-'}</small>
    </div>
  `).join("");
};

// ===== Área da Equipe =====
onAuthStateChanged(auth, (user)=>{
  const painel = byId('painelEquipe');
  const loginB = byId('loginBox');
  const msgE   = byId('msgEquipe');
  if(!painel || !loginB) return;
  if(user){ painel.classList.remove('d-none'); loginB.classList.add('d-none'); if(msgE) msgE.textContent=""; }
  else   { painel.classList.add('d-none'); loginB.classList.remove('d-none'); }
});

window.login = async () => {
  const email = byId('email')?.value?.trim();
  const senha = byId('senha')?.value?.trim();
  const msg   = byId('msgEquipe');
  try { await signInWithEmailAndPassword(auth, email, senha); }
  catch(e){ if(msg) msg.textContent = e.message; }
};

window.logout = async () => { await signOut(auth); };

window.salvarMedicamento = async () => {
  const nome = byId('nomeMed')?.value?.trim();
  const dos  = byId('dosagemMed')?.value?.trim();
  const disp = byId('dispMed')?.value === "true";
  const qt   = Number(byId('qtdMed')?.value || 0);
  const msg  = byId('msgMed');
  const user = auth.currentUser;
  if(!user){ if(msg) msg.textContent="Faça login."; return; }
  if(!nome){ if(msg) msg.textContent="Informe o nome do medicamento."; return; }
  const id = (nome.toLowerCase().replace(/\\s+/g,'-') + (dos?`-${dos.toLowerCase().replace(/\\s+/g,'-')}`:''))
              .replace(/[^a-z0-9\\-]/g,'');
  await setDoc(doc(db, "medicamentos", id), {
    nome, dosagem: dos||null, disponivel: disp, quantidade: qt||null,
    atualizadoPor: user.email, atualizadoEm: serverTimestamp()
  }, { merge: true });
  if(msg) msg.textContent = "Atualizado!";
};
