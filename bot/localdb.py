"""Локальная база бота (SQLite-файл рядом с ботом). Тот же набор методов, что у DB для Supabase.
Работает без интернета до базы и без VPN — всё хранится в файле gorod.db."""
import json, random, sqlite3
from pathlib import Path


class LocalDB:
    def __init__(self, path: Path):
        self.c = sqlite3.connect(path)
        self.c.row_factory = sqlite3.Row
        self.c.executescript("""
        create table if not exists residents (
          id integer primary key autoincrement, nick text not null, wish text not null default '', code text not null,
          status text not null default 'pending', recipe text, tg_id integer, claimed integer not null default 0,
          created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')), approved_at text);
        create unique index if not exists residents_one_approved on residents(nick) where status = 'approved';
        create index if not exists residents_tg on residents(tg_id);
        create table if not exists payments (
          id integer primary key autoincrement, tg_id integer not null, nick text not null, stars integer not null,
          charge_id text not null unique, recipe text not null, created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
        create table if not exists klad (
          id integer primary key autoincrement, tg_id integer not null, nick text not null, day text not null,
          used integer not null default 0, created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')), unique (tg_id, day));
        create table if not exists ai_orders (
          id integer primary key autoincrement, tg_id integer not null, nick text not null, text text not null,
          status text not null default 'new', recipe text, charge_id text, created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
        """)
        self.c.commit()

    @staticmethod
    def _row(r):
        if r is None:
            return None
        d = dict(r)
        if d.get("recipe"):
            d["recipe"] = json.loads(d["recipe"])
        if "claimed" in d:
            d["claimed"] = bool(d["claimed"])
        return d

    def _one(self, sql, *a):
        return self._row(self.c.execute(sql, a).fetchone())

    async def linked(self, tg_id):
        return self._one("select * from residents where tg_id=? and status='approved' limit 1", tg_id)

    async def by_nick(self, nick):
        r = self._one("select * from residents where nick=? and status='approved' limit 1", nick)
        return [r] if r else []

    async def create_pending(self, nick, tg_id):
        if self._one("select id from residents where nick=? and status='approved'", nick):
            raise RuntimeError("already_has_house")
        if self.c.execute("select count(*) from residents where nick=? and status='pending'", (nick,)).fetchone()[0] >= 3:
            raise RuntimeError("too_many_pending")
        cur = self.c.execute("insert into residents (nick, code, tg_id) values (?,?,?)", (nick, f"{random.randint(1000, 9999)}", tg_id))
        self.c.commit()
        return await self.get(cur.lastrowid)

    async def get(self, rid):
        return self._one("select * from residents where id=?", rid)

    async def patch(self, rid, body):
        body = {k: (json.dumps(v, ensure_ascii=False) if k == "recipe" and v is not None else int(v) if isinstance(v, bool) else v) for k, v in body.items()}
        try:
            self.c.execute(f"update residents set {', '.join(k + '=?' for k in body)} where id=?", (*body.values(), rid))
            self.c.commit()
        except sqlite3.IntegrityError as e:
            raise RuntimeError(str(e))

    async def pending(self):
        return [self._row(r) for r in self.c.execute("select * from residents where status='pending' and claimed=1 order by created_at limit 50")]

    async def count(self, path):
        q = {
            "residents?status=eq.pending&claimed=eq.true": "select count(*) from residents where status='pending' and claimed=1",
            "residents?status=eq.approved&recipe=not.is.null": "select count(*) from residents where status='approved' and recipe is not null",
        }[path]
        return self.c.execute(q).fetchone()[0]

    async def stars_total(self):
        s, n = self.c.execute("select coalesce(sum(stars),0), count(*) from payments").fetchone()
        return s, n

    async def add_payment(self, tg_id, nick, stars, charge_id, recipe):
        try:
            self.c.execute("insert into payments (tg_id, nick, stars, charge_id, recipe) values (?,?,?,?,?)", (tg_id, nick, stars, charge_id, json.dumps(recipe)))
            self.c.commit()
        except sqlite3.IntegrityError as e:
            raise RuntimeError(str(e))

    async def klad_today(self, day):
        return self.c.execute("select count(*) from klad where day=?", (day,)).fetchone()[0]

    async def klad_add(self, tg_id, nick, day):
        try:
            self.c.execute("insert into klad (tg_id, nick, day) values (?,?,?)", (tg_id, nick, day))
            self.c.commit()
        except sqlite3.IntegrityError as e:
            raise RuntimeError(str(e))

    async def klad_gift(self, tg_id):
        r = self.c.execute("select id from klad where tg_id=? and used=0 order by id limit 1", (tg_id,)).fetchone()
        return r[0] if r else None

    async def klad_use(self, kid):
        self.c.execute("update klad set used=1 where id=?", (kid,))
        self.c.commit()

    async def special(self):
        return [{"nick": r["nick"], "recipe": json.loads(r["recipe"])} for r in
                self.c.execute("select nick, recipe from residents where status='approved' and recipe is not null order by nick")]

    # ---- дома по описанию ----
    async def ai_create(self, tg_id, nick, text):
        cur = self.c.execute("insert into ai_orders (tg_id, nick, text) values (?,?,?)", (tg_id, nick, text))
        self.c.commit()
        return cur.lastrowid

    async def ai_get(self, oid):
        return self._row(self.c.execute("select * from ai_orders where id=?", (oid,)).fetchone())

    async def ai_patch(self, oid, body):
        body = {k: (json.dumps(v, ensure_ascii=False) if k == "recipe" else v) for k, v in body.items()}
        self.c.execute(f"update ai_orders set {', '.join(k + '=?' for k in body)} where id=?", (*body.values(), oid))
        self.c.commit()

    async def ai_list(self, status):
        return [self._row(r) for r in self.c.execute("select * from ai_orders where status=? order by id", (status,))]
