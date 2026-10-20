import { useEffect, useState } from 'react';
import { getDb, persist } from './db/database';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

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

const num = (s: string): number | null =>
  s.trim() === '' ? null : Number(s.replace(',', '.'));

export default function App() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const d = today();

      const stmt = db.prepare(`SELECT domain, value FROM daily_logs WHERE dia = ?`);
      stmt.bind([d]);
      while (stmt.step()) {
        const row = stmt.getAsObject() as { domain: string; value: number | null };
        if (row.domain === 'peso' && row.value != null) {
          setForm(f => ({ ...f, peso: String(row.value) }));
        } else if (row.domain === 'treino') {
          setForm(f => ({ ...f, treino: row.value === 1 }));
        } else if (row.domain === 'estudo') {
          setForm(f => ({ ...f, estudo: row.value === 1 }));
        }
      }
      stmt.free();

      const c = db.prepare(
        `SELECT tipo, minutos, distancia_km, intensidade FROM cardio_logs WHERE dia = ?`
      );
      c.bind([d]);
      if (c.step()) {
        const r = c.getAsObject();
        setForm(f => ({
          ...f,
          cardioTipo: String(r.tipo),
          cardioMin: r.minutos != null ? String(r.minutos) : '',
          cardioKm: r.distancia_km != null ? String(r.distancia_km) : '',
          cardioInt: r.intensidade != null ? String(r.intensidade) : '',
        }));
      }
      c.free();

      const a = db.prepare(
        `SELECT valor FROM invest_transactions WHERE data = ? AND tipo = 'aporte'`
      );
      a.bind([d]);
      if (a.step()) {
        const r = a.getAsObject();
        setForm(f => ({ ...f, aporte: r.valor != null ? String(r.valor) : '' }));
      }
      a.free();
      setReady(true);
    })();
  }, []);

  async function handleSave() {
    const db = await getDb();
    const d = today();

    const upsertDaily = (domain: string, value: number) => {
      db.run(
        `INSERT INTO daily_logs (id, dia, domain, value) VALUES (?, ?, ?, ?)
         ON CONFLICT(dia, domain) DO UPDATE SET value = excluded.value`,
        [crypto.randomUUID(), d, domain, value]
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
        [crypto.randomUUID(), d, form.cardioTipo, num(form.cardioMin), num(form.cardioKm), num(form.cardioInt)]
      );
    }

    db.run(`DELETE FROM invest_transactions WHERE data = ? AND tipo = 'aporte'`, [d]);
    const aporte = num(form.aporte);
    if (aporte != null) {
      db.run(
        `INSERT INTO invest_transactions (id, data, tipo, valor) VALUES (?, ?, 'aporte', ?)`,
        [crypto.randomUUID(), d, aporte]
      );
    }

    persist();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  if (!ready) return <p className="loading">Carregando…</p>;

  return (
    <main className="container">
      <h1>Hoje — {today()}</h1>

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
  );
}