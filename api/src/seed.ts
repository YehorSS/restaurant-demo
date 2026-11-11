import { hashPassword } from './password';

export interface Env {
  DB: D1Database;
  OWNER_PASSWORD: string;
  ASSETS?: Fetcher;
}

type Dish = [en: string, local: string, descEn: string, descLocal: string, price: number, weight?: number, fire?: boolean];
type Section = [en: string, local: string, dishes: Dish[]];

export const RESTAURANTS = [
  { id: 'lucciola', name: 'Trattoria Lucciola', tz: 'Europe/Rome', phone: '+39 071 555 0142', prefix: 'TR' },
  { id: 'zhar', name: 'ЖАР', tz: 'Europe/Kyiv', phone: '+380 44 555 0177', prefix: 'ZH' },
] as const;

const LUCCIOLA_SHIFTS = [['12:00', '15:00'], ['19:00', '23:00']];
const HOURS: Record<string, [number, string, string][]> = {
  lucciola: [0, 2, 3, 4, 5, 6].flatMap(d => LUCCIOLA_SHIFTS.map(([o, c]) => [d, o, c] as [number, string, string])),
  zhar: [0, 1, 2, 3, 4, 5, 6].map(d => [d, '12:00', '23:00'] as [number, string, string]),
};

const TABLES: Record<string, [seats: number, n: number][]> = {
  lucciola: [[2, 6], [4, 5], [6, 2]],
  zhar: [[2, 8], [4, 6], [6, 3], [8, 1]],
};

// prices in minor units: euro cents for lucciola, kopiyky for zhar
const MENU: Record<string, Section[]> = {
  lucciola: [
    ['Antipasti', 'Antipasti', [
      ['Olive all’ascolana', 'Olive all’ascolana', 'Fried stuffed green olives, the Marche classic', 'Olive verdi ripiene e fritte, il classico delle Marche', 900],
      ['Anchovies and butter', 'Alici e burro', 'Cantabrian anchovies, cold butter, toasted bread', 'Alici del Cantabrico, burro freddo, pane tostato', 1100],
      ['Burrata and tomatoes', 'Burrata e pomodorini', 'Burrata from Andria, datterini tomatoes, basil oil', 'Burrata di Andria, datterini, olio al basilico', 1300],
      ['Mussels in broth', 'Cozze in brodetto', 'Portonovo mussels, tomato, garlic and wine', 'Moscioli di Portonovo, pomodoro, aglio e vino', 1200],
    ]],
    ['First courses', 'Primi', [
      ['Vincisgrassi', 'Vincisgrassi', 'Baked lasagne of the Marche with ragù and béchamel', 'Lasagna al forno marchigiana con ragù e besciamella', 1600],
      ['Spaghetti with clams', 'Spaghetti alle vongole', 'Adriatic clams, garlic, parsley, a little chilli', 'Vongole dell’Adriatico, aglio, prezzemolo, peperoncino', 1700],
      ['Tagliatelle with ragù', 'Tagliatelle al ragù', 'Hand-cut egg pasta, slow beef and pork ragù', 'Pasta all’uovo tirata a mano, ragù cotto a lungo', 1500],
      ['Cacio e pepe', 'Cacio e pepe', 'Tonnarelli, pecorino romano, black pepper', 'Tonnarelli, pecorino romano, pepe nero', 1300],
      ['Passatelli in broth', 'Passatelli in brodo', 'Bread and parmesan noodles in capon broth', 'Passatelli in brodo di cappone', 1400],
    ]],
    ['Main courses', 'Secondi', [
      ['Brodetto of Ancona', 'Brodetto all’anconetana', 'Fish stew with thirteen kinds of Adriatic fish', 'Zuppa di tredici pesci dell’Adriatico', 2600],
      ['Rabbit in porchetta', 'Coniglio in porchetta', 'Rabbit roasted with wild fennel and garlic', 'Coniglio arrosto con finocchietto selvatico', 2100],
      ['Grilled sea bass', 'Branzino alla griglia', 'Whole sea bass, lemon, salmoriglio', 'Branzino intero, limone, salmoriglio', 2400],
      ['Saltimbocca', 'Saltimbocca alla romana', 'Veal, prosciutto and sage, white wine sauce', 'Vitello, prosciutto e salvia, sfumato al vino', 2000],
    ]],
    ['Desserts', 'Dolci', [
      ['Tiramisù', 'Tiramisù', 'Mascarpone, savoiardi, espresso', 'Mascarpone, savoiardi, caffè', 700],
      ['Lemon sorbet', 'Sorbetto al limone', 'Amalfi lemons, made in house', 'Limoni di Amalfi, fatto in casa', 600],
      ['Ciambellone', 'Ciambellone', 'Grandmother’s ring cake with vino cotto', 'Ciambellone della nonna con vino cotto', 650],
      ['Panna cotta', 'Panna cotta', 'With sour cherries in syrup', 'Con amarene sciroppate', 700],
    ]],
  ],
  zhar: [
    ['Starters', 'Закуски', [
      ['Salo three ways', 'Сало трьома способами', 'Smoked, salted and whipped, rye toast, pickled onion', 'Копчене, солоне й збите, житній тост, маринована цибуля', 21000, 120],
      ['Beet tartare', 'Тартар із печеного буряка', 'Ember-baked beetroot, horseradish cream, walnuts', 'Буряк з вугілля, крем з хріну, волоські горіхи', 18500, 180, true],
      ['Pickles from the cellar', 'Соління з льоху', 'Cucumbers, tomatoes, cabbage, apples', 'Огірки, помідори, капуста, яблука', 14000, 250],
      ['Chicken liver pâté', 'Паштет з курячої печінки', 'Plum jam, toasted brioche', 'Сливове варення, підсмажена бріош', 19500, 150],
    ]],
    ['From the fire', 'З вогню', [
      ['Pork neck on oak', 'Свиняча шия на дубі', 'Twelve hours in brine, grilled over oak', 'Дванадцять годин у розсолі, на дубовому вугіллі', 42000, 300, true],
      ['Trout on the grill', 'Форель на грилі', 'Carpathian trout, dill butter', 'Карпатська форель, кропове масло', 39000, 350, true],
      ['Ember potatoes', 'Картопля з жару', 'Baked in coals, smetana, chives', 'Печена в жару, сметана, цибуля', 16000, 300, true],
      ['Kovbasa from the grill', 'Домашня ковбаса на грилі', 'Pork and beef, mustard, pickled cabbage', 'Свинина й яловичина, гірчиця, квашена капуста', 34000, 280, true],
      ['Beef short rib', 'Яловиче ребро', 'Slow-smoked, cherry glaze', 'Повільно копчене, вишнева глазур', 56000, 400, true],
    ]],
    ['Mains', 'Гаряче', [
      ['Borshch', 'Борщ', 'Smoked pear and beef, pampushky with garlic', 'З копченою грушею та яловичиною, пампушки з часником', 24000, 400],
      ['Varenyky with potato', 'Вареники з картоплею', 'Crispy onion, smetana', 'Хрустка цибуля, сметана', 21000, 300],
      ['Banosh with brynza', 'Банош з бринзою', 'Corn grits on cream, mushrooms, brynza', 'Кукурудзяна крупа на вершках, гриби, бринза', 26000, 320],
      ['Holubtsi', 'Голубці', 'Pork and rice in cabbage, tomato sauce', 'Свинина й рис у капусті, томатний соус', 25000, 350],
    ]],
    ['Desserts', 'Десерти', [
      ['Syrnyky', 'Сирники', 'Sour cherry jam, sour cream', 'Вишневе варення, сметана', 17000, 200],
      ['Honey cake', 'Медовик', 'Buckwheat honey, salted caramel', 'Гречаний мед, солона карамель', 16500, 150],
      ['Baked apple', 'Печене яблуко', 'From the embers, walnut and honey', 'З жару, горіх і мед', 14000, 220, true],
      ['Poppy seed roll', 'Маківник', 'Grandmother’s recipe, cream', 'Бабусин рецепт, вершки', 15000, 160],
    ]],
  ],
};

export async function seedMenu(db: D1Database): Promise<void> {
  await db.batch([db.prepare('DELETE FROM dishes'), db.prepare('DELETE FROM menu_sections')]);
  const stmts: D1PreparedStatement[] = [];
  let sid = 0, did = 0;
  for (const [rid, sections] of Object.entries(MENU))
    sections.forEach(([en, local, dishes], si) => {
      sid++;
      stmts.push(db.prepare('INSERT INTO menu_sections (id, rid, sort, title_en, title_local) VALUES (?, ?, ?, ?, ?)').bind(sid, rid, si, en, local));
      dishes.forEach(([nEn, nLoc, dEn, dLoc, price, weight, fire], di) => {
        did++;
        stmts.push(db.prepare('INSERT INTO dishes (id, section_id, sort, name_en, name_local, desc_en, desc_local, price_cents, weight_g, photo, fire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(did, sid, di, nEn, nLoc, dEn, dLoc, price, weight ?? null, `${rid}/${did}.webp`, fire ? 1 : 0));
      });
    });
  await db.batch(stmts);
}

export async function seed(db: D1Database): Promise<void> {
  const have = await db.prepare('SELECT count(*) n FROM restaurants').first<{ n: number }>();
  if (have && have.n > 0) return;
  const stmts: D1PreparedStatement[] = [];
  for (const r of RESTAURANTS) {
    stmts.push(db.prepare('INSERT INTO restaurants (id, name, tz, phone, prefix) VALUES (?, ?, ?, ?, ?)').bind(r.id, r.name, r.tz, r.phone, r.prefix));
    for (const [d, o, c] of HOURS[r.id]) stmts.push(db.prepare('INSERT INTO hours (rid, weekday, open, close) VALUES (?, ?, ?, ?)').bind(r.id, d, o, c));
    let n = 0;
    for (const [seats, count] of TABLES[r.id])
      for (let i = 0; i < count; i++) stmts.push(db.prepare('INSERT INTO tables (rid, seats, label) VALUES (?, ?, ?)').bind(r.id, seats, `T${++n}`));
  }
  const demo = await hashPassword('demo');
  stmts.push(db.prepare('INSERT INTO users (login, hash, salt, role) VALUES (?, ?, ?, ?)').bind('demo', demo.hash, demo.salt, 'demo'));
  await db.batch(stmts);
  await seedMenu(db);
}
