import type { Database } from 'sql.js';
import { persist } from './database';

export const DIAS_HISTORICO = 7;

export type Pagina = 'home' | 'saude' | 'dopamina';

export type Form = {
  peso: string;
  treino: boolean;
  cardioTipo: string;
  cardioMin: string;
  cardioKm: string;
  cardioInt: string;
  instaAbst: boolean;
  instaHoras: string; // '' | '0' (<1h) | '1' (1–3h) | '2' (>3h)
  sono: string;
};

export type Resumo = { dia: string; form: Form };

// D16: 'bike' continua sendo o valor gravado (legado); a UI mostra "Bicicleta".
export const EMPTY: Form = {
  peso: '',
  treino: false,
  cardioTipo: 'bike',
  cardioMin: '',
  cardioKm: '',
  cardioInt: '',
  instaAbst: false,
  instaHoras: '',
  sono: '',
};

export const today = (): string => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

export const num = (s: string): number | null =>
  s.trim() === '' ? null : Number(s.replace(',', '.'));

export const formatarDia = (dia: string): string => dia.split('-').reverse().join('/');

// Hoje primeiro; offsets negativos rolam mês/ano pelo construtor Date local.
export const listarUltimos7Dias = (): string[] => {
  const base = new Date();
  const dias: string[] = [];
  for (let i = 0; i < DIAS_HISTORICO; i++) {
    dias.push(
      new Date(base.getFullYear(), base.getMonth(), base.getDate() - i).toLocaleDateString('en-CA')
    );
  }
  return dias;
};

export const temRegistroSaude = (f: Form): boolean =>
  f.peso.trim() !== '' ||
  f.cardioMin.trim() !== '' ||
  f.cardioKm.trim() !== '' ||
  f.cardioInt.trim() !== '' ||
  f.treino;

export const temRegistroDopamina = (f: Form): boolean =>
  f.instaAbst || f.instaHoras !== '' || f.sono.trim() !== '';

// D23: chip resumido do dropdown de horas ('' = vazio).
export const rotuloHoras = (v: string): string =>
  v === '0' ? '<1h' : v === '1' ? '1–3h' : v === '2' ? '>3h' : '—';

const horasValor = (v: string): number | null =>
  v === '0' ? 0 : v === '1' ? 1 : v === '2' ? 2 : null;

// D16: valor legado/desconhecido cai em 'bike' (Bicicleta); colunas inalteradas.
const tipoCardio = (tipo: string): string =>
  tipo === 'esteira' || tipo === 'corrida' ? tipo : 'bike';

const rotuloCardio = (tipo: string): string =>
  tipoCardio(tipo) === 'esteira' ? 'Esteira' : tipoCardio(tipo) === 'corrida' ? 'Corrida' : 'Bicicleta';

// D9/D17: linha do histórico mostra só peso/treino/cardio.
export const chipCardio = (f: Form): string => {
  if (f.cardioMin.trim()) return `${rotuloCardio(f.cardioTipo)} ${f.cardioMin.trim()}min`;
  if (f.cardioKm.trim()) return `${rotuloCardio(f.cardioTipo)} ${f.cardioKm.trim()}km`;
  return '—';
};

// SELECTs de carga (peso/treino + cardio), parametrizados pelo dia.
export const lerDia = (db: Database, dia: string): Form => {
  const lido: Form = { ...EMPTY };

  const stmt = db.prepare(`SELECT domain, value FROM daily_logs WHERE dia = ?`);
  stmt.bind([dia]);
  while (stmt.step()) {
    const row = stmt.getAsObject() as { domain: string; value: number | null };
    if (row.domain === 'peso' && row.value != null) {
      lido.peso = String(row.value);
    } else if (row.domain === 'treino') {
      lido.treino = row.value === 1;
    } else if (row.domain === 'dopamina_insta_abst') {
      lido.instaAbst = row.value === 1;
    } else if (row.domain === 'dopamina_insta_horas' && row.value != null) {
      lido.instaHoras = String(row.value);
    } else if (row.domain === 'sono_horas' && row.value != null) {
      lido.sono = String(row.value);
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

export const carregarUltimos7Dias = async (db: Database): Promise<Resumo[]> =>
  listarUltimos7Dias().map(dia => ({ dia, form: lerDia(db, dia) }));

const upsertDaily = (db: Database, dia: string, domain: string, value: number) => {
  db.run(
    `INSERT INTO daily_logs (id, dia, domain, value) VALUES (?, ?, ?, ?)
     ON CONFLICT(dia, domain) DO UPDATE SET value = excluded.value`,
    [crypto.randomUUID(), dia, domain, value]
  );
};

const limparDomain = (db: Database, dia: string, domain: string) => {
  db.run(`DELETE FROM daily_logs WHERE dia = ? AND domain = ?`, [dia, domain]);
};

// Gravação do dia exibido (upserts/delete+insert por página) + persist().
export const gravar = async (db: Database, dia: string, pagina: Pagina, form: Form): Promise<void> => {
  if (pagina === 'saude') {
    const peso = num(form.peso);
    if (peso != null) upsertDaily(db, dia, 'peso', peso);
    upsertDaily(db, dia, 'treino', form.treino ? 1 : 0);

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
  } else {
    // D22/D23: "não abri hoje" trava as horas e grava vazio; senão 0/1/2 ou vazio (—).
    upsertDaily(db, dia, 'dopamina_insta_abst', form.instaAbst ? 1 : 0);
    const horas = form.instaAbst ? null : horasValor(form.instaHoras);
    if (horas == null) limparDomain(db, dia, 'dopamina_insta_horas');
    else upsertDaily(db, dia, 'dopamina_insta_horas', horas);

    // D24: horas de sono 0–24 (num() aceita vírgula); vazio = sem registro.
    const sonoLido = num(form.sono);
    if (sonoLido == null) limparDomain(db, dia, 'sono_horas');
    else upsertDaily(db, dia, 'sono_horas', Math.min(24, Math.max(0, sonoLido)));
  }

  persist();
};

// D18/D19: reset apaga o dia nas 3 tabelas (DEC-006: nenhum DROP/ALTER).
export const resetDia = async (db: Database, dia: string): Promise<void> => {
  db.run(`DELETE FROM daily_logs WHERE dia = ?`, [dia]);
  db.run(`DELETE FROM cardio_logs WHERE dia = ?`, [dia]);
  db.run(`DELETE FROM invest_transactions WHERE data = ?`, [dia]);
  persist();
};
