import { useEffect, useState } from 'react';
import type { Database } from 'sql.js';
import { getDb, persist } from './db/database';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const DIAS_HISTORICO = 7;

type Pagina = 'home' | 'saude';

type Form = {
  peso: string;
  treino: boolean;
  cardioTipo: string;
  cardioMin: string;
  cardioKm: string;
  cardioInt: string;
};

// D16: 'bike' continua sendo o valor gravado (legado); a UI mostra "Bicicleta".
const EMPTY: Form = {
  peso: '',
  treino: false,
  cardioTipo: 'bike',
  cardioMin: '',
  cardioKm: '',
  cardioInt: '',
};

// D13: módulos sem tela nesta sprint — botões cinza, sem clique, sem rota.
const MODULOS = ['Gestão de dopamina', 'Finanças', 'Aviação', 'Self improvement'];

type Resumo = { dia: string; form: Form };

const num = (s: string): number | null =>
  s.trim() === '' ? null : Number(s.replace(',', '.'));

const formatarDia = (dia: string): string => dia.split('-').reverse().join('/');

// Hoje primeiro; offsets negativos rolam mês/ano pelo construtor Date local.
const listarUltimos7Dias = (): string[] => {
  const base = new Date();
  const dias: string[] = [];
  for (let i = 0; i < DIAS_HISTORICO; i++) {
    dias.push(
      new Date(base.getFullYear(), base.getMonth(), base.getDate() - i).toLocaleDateString('en-CA')
    );
  }
  return dias;
};

const temRegistro = (f: Form): boolean =>
  f.peso.trim() !== '' ||
  f.cardioMin.trim() !== '' ||
  f.cardioKm.trim() !== '' ||
  f.cardioInt.trim() !== '' ||
  f.treino;

// D16: valor legado/desconhecido cai em 'bike' (Bicicleta); colunas inalteradas.
const tipoCardio = (tipo: string): string =>
  tipo === 'esteira' || tipo === 'corrida' ? tipo : 'bike';

const rotuloCardio = (tipo: string): string =>
  tipoCardio(tipo) === 'esteira' ? 'Esteira' : tipoCardio(tipo) === 'corrida' ? 'Corrida' : 'Bicicleta';

// D9/D17: linha do histórico mostra só peso/treino/cardio.
const chipCardio = (f: Form): string => {
  if (f.cardioMin.trim()) return `${rotuloCardio(f.cardioTipo)} ${f.cardioMin.trim()}min`;
  if (f.cardioKm.trim()) return `${rotuloCardio(f.cardioTipo)} ${f.cardioKm.trim()}km`;
  return '—';
};

// SELECTs de carga (peso/treino + cardio), parametrizados pelo dia.
const lerDia = (db: Database, dia: string): Form => {
  const lido: Form = { ...EMPTY };

  const stmt = db.prepare(`SELECT domain, value FROM daily_logs WHERE dia = ?`);
  stmt.bind([dia]);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { domain: string; value: number | null };
    if (row.domain === 'peso' && row.value != null) {
      lido.peso = String(row.value);
    } else if (row.domain === 'treino') {
      lido.treino = row.value === 1;
    }
  }
  stmt.free();

  const c = db.prepare(
    `SELECT tipo, minutos, distancia_km, intensidade FROM cardio_logs WHERE dia = ?`
  );
  c.bind([dia]);
  if (c.step()) {
    const r = c.getAsObject();
    lido.cardioTipo = tipoCardio(String(r.tipo));
    lido.cardioMin = r.minutos != null ? String(r.minutos) : '';
    lido.cardioKm = r.distancia_km != null ? String(r.distancia_km) : '';
    lido.cardioInt = r.intensidade != null ? String(r.intensidade) : '';
  }
  c.free();

  return lido;
};

const carregarUltimos7Dias = async (db: Database): Promise<Resumo[]> =>
  listarUltimos7Dias().map(dia => ({ dia, form: lerDia(db, dia) }));

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

  async function gravar(dia: string) {
    const db = await getDb();

    const upsertDaily = (domain: string, value: number) => {
      db.run(
        `INSERT INTO daily_logs (id, dia, domain, value) VALUES (?, ?, ?, ?)
         ON CONFLICT(dia, domain) DO UPDATE SET value = excluded.value`,
        [crypto.randomUUID(), dia, domain, value]
      );
    };

    const peso = num(form.peso);
    if (peso != null) upsertDaily('peso', peso);
    upsertDaily('treino', form.treino ? 1 : 0);

    if (form.cardioMin.trim() || form.cardioKm.trim() || form.cardioInt.trim()) {
      db.run(
        `INSERT INTO cardio_logs (id, dia, tipo, minutos, distancia_km, intensidade)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(dia) DO UPDATE SET
           tipo = excluded.tipo,
           minutos = excluded.minutos,
           distancia_km = excluded.distancia_km,
           intensidade = excluded.intensidade`,
        [crypto.randomUUID(), dia, form.cardioTipo, num(form.cardioMin), num(form.cardioKm), num(form.cardioInt)]
      );
    }

    persist();
    setSaved(true);
    setHistorico(await carregarUltimos7Dias(db));
    window.setTimeout(() => setSaved(false), 2000);
  }

  async function handleSave() {
    if (diaEditando != null) {
      setConfirmacaoPendente(true); // dia passado: só grava após confirmação no modal
      return;
    }
    await gravar(today());
  }

  async function confirmarGravacao() {
    const dia = diaEditando;
    setConfirmacaoPendente(false);
    if (dia != null) await gravar(dia);
  }

  // D18/D19: reset apaga o dia nas 3 tabelas; o dia exibido volta para EMPTY.
  async function resetDia(dia: string) {
    const db = await getDb();
    db.run(`DELETE FROM daily_logs WHERE dia = ?`, [dia]);
    db.run(`DELETE FROM cardio_logs WHERE dia = ?`, [dia]);
    db.run(`DELETE FROM invest_transactions WHERE data = ?`, [dia]);
    persist();
    if (dia === (diaEditando ?? today())) setForm({ ...EMPTY });
    setSaved(false);
    setHistorico(await carregarUltimos7Dias(db));
  }

  async function confirmarReset() {
    const dia = resetPendente;
    setResetPendente(null);
    if (dia != null) await resetDia(dia);
  }

  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  if (!ready) return <p className="loading">Carregando…</p>;

  const diaAtual = diaEditando ?? today();

  if (pagina === 'home') {
    return (
      <div className="container">
        <h1>life-tracker</h1>
        <div className="menu">
          <button className="menu-item ativo" onClick={() => setPagina('saude')}>Saúde</button>
          {MODULOS.map(nome => (
            <button key={nome} className="menu-item" disabled title="em breve">{nome}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topo">
        <h1>{diaEditando ? `Editando ${formatarDia(diaEditando)}` : `Saúde — ${today()}`}</h1>
        <div className="acoes">
          <button className="ghost" onClick={() => setMostrarHistorico(true)}>Histórico</button>
          <button
            className="ghost"
            onClick={() => { setMostrarHistorico(false); setPagina('home'); }}
          >
            Voltar
          </button>
        </div>
      </div>

      {diaEditando && (
        <button className="ghost voltar" onClick={() => carregarDia(today())}>Voltar para hoje</button>
      )}

      <section className="card">
        <h2>Peso (kg)</h2>
        <input
          type="text" inputMode="decimal" placeholder="82,4" value={form.peso}
          onChange={e => set({ peso: e.target.value })}
        />
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

      <button className="save" onClick={handleSave}>{saved ? 'Salvo ✓' : 'Salvar'}</button>

      {mostrarHistorico && (
        <>
          <div className="overlay" onClick={() => setMostrarHistorico(false)} />
          <div className="historico-painel" role="dialog" aria-modal="true">
            <h2>Histórico — 7 dias</h2>
            <ul className="dias">
              {historico.map(({ dia, form: resumo }) => (
                <li key={dia} className="dia-linha">
                  <button
                    className={dia === diaAtual ? 'dia ativo' : 'dia'}
                    onClick={() => carregarDia(dia)}
                  >
                    <span className="dia-data">{formatarDia(dia)}</span>
                    {temRegistro(resumo) ? (
                      <span className="chips">
                        <span className={resumo.peso.trim() ? 'chip' : 'chip vazio'}>
                          {resumo.peso.trim() ? `${resumo.peso} kg` : '—'}
                        </span>
                        <span className={resumo.treino ? 'chip' : 'chip vazio'}>
                          {resumo.treino ? 'treino ✓' : 'treino ·'}
                        </span>
                        <span className={chipCardio(resumo) === '—' ? 'chip vazio' : 'chip'}>
                          {chipCardio(resumo)}
                        </span>
                      </span>
                    ) : (
                      <span className="dia-resumo">— sem registro —</span>
                    )}
                  </button>
                  <button
                    className="reset"
                    title={`Zerar ${formatarDia(dia)}`}
                    onClick={() => setResetPendente(dia)}
                  >
                    Zerar
                  </button>
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
