import { useEffect, useState } from 'react';
import { getDb } from './db/database';
import type { Form, Pagina, Resumo } from './db/repo';
import {
  carregarUltimos7Dias, chipCardio, EMPTY, formatarDia, gravar, lerDia, resetDia, rotuloHoras,
  temRegistroDopamina, temRegistroSaude, today,
} from './db/repo';

// D13/D20: módulos ainda sem tela — botões cinza, sem clique, sem rota.
const MODULOS = ['Finanças', 'Aviação', 'Self improvement'];

// D9/D17/D23: chips resumidos da linha do histórico (Saúde x Dopamina).
const chipsDoDia = (f: Form, ehSaude: boolean): { texto: string; vazio: boolean }[] =>
  ehSaude
    ? [
        { texto: f.peso.trim() ? `${f.peso} kg` : '—', vazio: !f.peso.trim() },
        { texto: f.treino ? 'treino ✓' : 'treino ·', vazio: !f.treino },
        { texto: chipCardio(f), vazio: chipCardio(f) === '—' },
      ]
    : [
        { texto: f.instaAbst ? 'IG ✓' : 'IG ·', vazio: !f.instaAbst },
        { texto: f.instaAbst ? '—' : rotuloHoras(f.instaHoras), vazio: f.instaAbst || f.instaHoras === '' },
        { texto: f.sono.trim() ? `sono ${f.sono}h` : '—', vazio: !f.sono.trim() },
      ];

export default function App() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pagina, setPagina] = useState<Pagina>('home');
  const [diaEditando, setDiaEditando] = useState<string | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [confirmacaoPendente, setConfirmacaoPendente] = useState(false);
  const [resetPendente, setResetPendente] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Resumo[]>([]);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      setForm(lerDia(db, today()));
      setHistorico(await carregarUltimos7Dias(db));
      setReady(true);
    })();
  }, []);

  async function carregarDia(dia: string) {
    const db = await getDb();
    setForm(lerDia(db, dia));
    setDiaEditando(dia === today() ? null : dia);
    setMostrarHistorico(false);
    setConfirmacaoPendente(false);
    setSaved(false);
    setHistorico(await carregarUltimos7Dias(db));
  }

  // repo.ts faz o SQL + persist(); aqui fica só o estado de UI.
  async function salvarEm(dia: string) {
    const db = await getDb();
    await gravar(db, dia, pagina, form);
    setSaved(true);
    setHistorico(await carregarUltimos7Dias(db));
    window.setTimeout(() => setSaved(false), 2000);
  }

  async function handleSave() {
    if (diaEditando != null) {
      setConfirmacaoPendente(true); // dia passado: só grava após confirmação no modal
      return;
    }
    await salvarEm(today());
  }

  async function confirmarGravacao() {
    const dia = diaEditando;
    setConfirmacaoPendente(false);
    if (dia != null) await salvarEm(dia);
  }

  // D18/D19: repo apaga o dia nas 3 tabelas; o dia exibido volta para EMPTY.
  async function zerarDia(dia: string) {
    const db = await getDb();
    await resetDia(db, dia);
    if (dia === (diaEditando ?? today())) setForm({ ...EMPTY });
    setSaved(false);
    setHistorico(await carregarUltimos7Dias(db));
  }

  async function confirmarReset() {
    const dia = resetPendente;
    setResetPendente(null);
    if (dia != null) await zerarDia(dia);
  }

  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  if (!ready) return <p className="loading">Carregando…</p>;

  const diaAtual = diaEditando ?? today();
  const ehSaude = pagina === 'saude';
  const temRegistro = ehSaude ? temRegistroSaude : temRegistroDopamina;

  if (pagina === 'home') {
    return (
      <div className="container">
        <h1>life-tracker</h1>
        <div className="menu">
          <button className="menu-item ativo" onClick={() => setPagina('saude')}>Saúde</button>
          <button className="menu-item ativo" onClick={() => setPagina('dopamina')}>Gestão de dopamina</button>
          {MODULOS.map(nome => <button key={nome} className="menu-item" disabled title="em breve">{nome}</button>)}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topo">
        <h1>{diaEditando ? `Editando ${formatarDia(diaEditando)}` : `${ehSaude ? 'Saúde' : 'Gestão de dopamina'} — ${today()}`}</h1>
        <div className="acoes">
          <button className="ghost" onClick={() => setMostrarHistorico(true)}>Histórico</button>
          <button className="ghost" onClick={() => { setMostrarHistorico(false); setPagina('home'); }}>Voltar</button>
        </div>
      </div>

      {diaEditando && <button className="ghost voltar" onClick={() => carregarDia(today())}>Voltar para hoje</button>}

      {ehSaude ? (
        <>
          <section className="card">
            <h2>Peso (kg)</h2>
            <input type="text" inputMode="decimal" placeholder="82,4" value={form.peso} onChange={e => set({ peso: e.target.value })} />
          </section>
          <section className="card">
            <label className="toggle">
              <input type="checkbox" checked={form.treino} onChange={e => set({ treino: e.target.checked })} />
              Treino
            </label>
          </section>
          <section className="card">
            <h2>Cardio</h2>
            <select value={form.cardioTipo} onChange={e => set({ cardioTipo: e.target.value })}>
              <option value="esteira">Esteira</option>
              <option value="corrida">Corrida</option>
              <option value="bike">Bicicleta</option>
            </select>
            <div className="row">
              <label className="campo">
                <span>Distância (km)</span>
                <input placeholder="12" inputMode="decimal" value={form.cardioKm} onChange={e => set({ cardioKm: e.target.value })} />
              </label>
              <label className="campo">
                <span>Tempo (min)</span>
                <input placeholder="30" inputMode="numeric" value={form.cardioMin} onChange={e => set({ cardioMin: e.target.value })} />
              </label>
              <label className="campo">
                <span>Intensidade percebida</span>
                <input placeholder="1-10" inputMode="numeric" value={form.cardioInt} onChange={e => set({ cardioInt: e.target.value })} />
              </label>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <h2>Instagram</h2>
            <label className="toggle">
              <input type="checkbox" checked={form.instaAbst} onChange={e => set({ instaAbst: e.target.checked, instaHoras: e.target.checked ? '' : form.instaHoras })} />
              Não abri hoje
            </label>
            <label className="campo campo-bloco">
              <span>Horas no Instagram</span>
              <select value={form.instaAbst ? '' : form.instaHoras} disabled={form.instaAbst} onChange={e => set({ instaHoras: e.target.value })}>
                <option value="">—</option>
                <option value="0">&lt; 1 hora</option>
                <option value="1">1 a 3 horas</option>
                <option value="2">&gt; 3 horas</option>
              </select>
            </label>
          </section>
          <section className="card">
            <h2>Sono</h2>
            <label className="campo campo-bloco">
              <span>Horas dormidas</span>
              <input type="text" inputMode="decimal" placeholder="7,5" value={form.sono} onChange={e => set({ sono: e.target.value })} />
            </label>
          </section>
        </>
      )}

      <button className="save" onClick={handleSave}>{saved ? 'Salvo ✓' : 'Salvar'}</button>

      {mostrarHistorico && (
        <>
          <div className="overlay" onClick={() => setMostrarHistorico(false)} />
          <div className="historico-painel" role="dialog" aria-modal="true">
            <h2>Histórico — 7 dias</h2>
            <ul className="dias">
              {historico.map(({ dia, form: resumo }) => (
                <li key={dia} className="dia-linha">
                  <button className={dia === diaAtual ? 'dia ativo' : 'dia'} onClick={() => carregarDia(dia)}>
                    <span className="dia-data">{formatarDia(dia)}</span>
                    {temRegistro(resumo) ? (
                      <span className="chips">
                        {chipsDoDia(resumo, ehSaude).map(({ texto, vazio }, i) => (
                          <span key={i} className={vazio ? 'chip vazio' : 'chip'}>{texto}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="dia-resumo">— sem registro —</span>
                    )}
                  </button>
                  <button className="reset" title={`Zerar ${formatarDia(dia)}`} onClick={() => setResetPendente(dia)}>Zerar</button>
                </li>
              ))}
            </ul>
            <button className="ghost" onClick={() => setMostrarHistorico(false)}>Fechar</button>
          </div>
        </>
      )}

      {confirmacaoPendente && diaEditando && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Confirmar gravação</h2>
            <p>Salvar alterações em <strong>{formatarDia(diaEditando)}</strong>?</p>
            <div className="modal-acoes">
              <button className="save compacto" onClick={confirmarGravacao}>Confirmar</button>
              <button className="ghost" onClick={() => setConfirmacaoPendente(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {resetPendente && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Confirmar reset</h2>
            <p>Zerar <strong>{formatarDia(resetPendente)}</strong>?</p>
            <div className="modal-acoes">
              <button className="save compacto" onClick={confirmarReset}>Confirmar</button>
              <button className="ghost" onClick={() => setResetPendente(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
