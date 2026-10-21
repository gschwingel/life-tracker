import { useEffect, useState } from 'react';
import type { Database } from 'sql.js';
import { getDb, persist } from './db/database';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const DIAS_HISTORICO = 7;

type Form = {
  peso: string;
  treino: boolean;
  cardioTipo: string;
  cardioMin: string;
  cardioKm: string;
  cardioInt: string;
  estudo: boolean;
  aporte: string;
};

const EMPTY: Form = {
  peso: '',
  treino: false,
  cardioTipo: 'bike',
  cardioMin: '',
  cardioKm: '',
  cardioInt: '',
  estudo: false,
  aporte: '',
};

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

const resumoTexto = (f: Form): string => {
  const partes: string[] = [];
  if (f.peso.trim()) partes.push(`${f.peso} kg`);
  if (f.treino) partes.push('treino');
  if (f.cardioMin.trim() || f.cardioKm.trim()) partes.push(`cardio ${f.cardioMin.trim() || '0'} min`);
  if (f.estudo) partes.push('estudo');
  if (f.aporte.trim()) partes.push(`R$ ${f.aporte}`);
  return partes.length ? partes.join(' · ') : 'sem registro';
};

// Os três SELECTs de carga, parametrizados pelo dia.
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
    } else if (row.domain === 'estudo') {
      lido.estudo = row.value === 1;
    }
  }
  stmt.free();

  const c = db.prepare(
    `SELECT tipo, minutos, distancia_km, intensidade FROM cardio_logs WHERE dia = ?`
  );
  c.bind([dia]);
  if (c.step()) {
    const r = c.getAsObject();
    lido.cardioTipo = String(r.tipo);
    lido.cardioMin = r.minutos != null ? String(r.minutos) : '';
    lido.cardioKm = r.distancia_km != null ? String(r.distancia_km) : '';
    lido.cardioInt = r.intensidade != null ? String(r.intensidade) : '';
  }
  c.free();

  const a = db.prepare(`SELECT valor FROM invest_transactions WHERE data = ? AND tipo = 'aporte'`);
  a.bind([dia]);
  if (a.step()) {
    const r = a.getAsObject();
    lido.aporte = r.valor != null ? String(r.valor) : '';
  }
  a.free();

  return lido;
};

const carregarUltimos7Dias = async (db: Database): Promise<Resumo[]> =>
  listarUltimos7Dias().map(dia => ({ dia, form: lerDia(db, dia) }));

export default function App() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [diaEditando, setDiaEditando] = useState<string | null>(null);
  const [mostrarDrawer, setMostrarDrawer] = useState(false);
  const [confirmacaoPendente, setConfirmacaoPendente] = useState(false);
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
    setMostrarDrawer(false);
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
    upsertDaily('estudo', form.estudo ? 1 : 0);

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

    db.run(`DELETE FROM invest_transactions WHERE data = ? AND tipo = 'aporte'`, [dia]);
    const aporte = num(form.aporte);
    if (aporte != null) {
      db.run(
        `INSERT INTO invest_transactions (id, data, tipo, valor) VALUES (?, ?, 'aporte', ?)`,
        [crypto.randomUUID(), dia, aporte]
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

  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  if (!ready) return <p className="loading">Carregando…</p>;

  const diaAtual = diaEditando ?? today();

  return (
    <div className="layout">
      <main className="container">
        <div className="topo">
          <h1>{diaEditando ? `Editando ${formatarDia(diaEditando)}` : `Hoje — ${today()}`}</h1>
          <button className="ghost" onClick={() => setMostrarDrawer(true)}>Histórico</button>
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
            <option value="bike">Bike</option>
            <option value="esteira">Esteira</option>
            <option value="corrida">Corrida</option>
          </select>
          <div className="row">
            <input placeholder="min" inputMode="numeric" value={form.cardioMin} onChange={e => set({ cardioMin: e.target.value })} />
            <input placeholder="km" inputMode="decimal" value={form.cardioKm} onChange={e => set({ cardioKm: e.target.value })} />
            <input placeholder="RPE 1-10" inputMode="numeric" value={form.cardioInt} onChange={e => set({ cardioInt: e.target.value })} />
          </div>
        </section>

        <section className="card">
          <label className="toggle">
            <input type="checkbox" checked={form.estudo} onChange={e => set({ estudo: e.target.checked })} />
            Estudo
          </label>
        </section>

        <section className="card">
          <h2>Aporte (R$)</h2>
          <input type="text" inputMode="decimal" placeholder="0,00" value={form.aporte} onChange={e => set({ aporte: e.target.value })} />
        </section>

        <button className="save" onClick={handleSave}>{saved ? 'Salvo ✓' : 'Salvar'}</button>
      </main>

      {mostrarDrawer && (
        <>
          <div className="overlay" />
          <aside className="drawer">
            <h2>Últimos 7 dias</h2>
            <ul className="dias">
              {historico.map(({ dia, form: resumo }) => (
                <li key={dia}>
                  <button
                    className={dia === diaAtual ? 'dia ativo' : 'dia'}
                    onClick={() => carregarDia(dia)}
                  >
                    <span className="dia-data">
                      {dia === today() ? `Hoje — ${formatarDia(dia)}` : formatarDia(dia)}
                    </span>
                    <span className="dia-resumo">{resumoTexto(resumo)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="ghost" onClick={() => setMostrarDrawer(false)}>Fechar</button>
          </aside>
        </>
      )}

      {confirmacaoPendente && diaEditando && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Confirmar gravação</h2>
            <p>
              Gravar as alterações em <strong>{formatarDia(diaEditando)}</strong>? Os registros desse
              dia serão substituídos pelos valores da tela.
            </p>
            <div className="modal-acoes">
              <button className="ghost" onClick={() => setConfirmacaoPendente(false)}>Cancelar</button>
              <button className="save compacto" onClick={confirmarGravacao}>Gravar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
