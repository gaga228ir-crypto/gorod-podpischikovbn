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
        create table if not exists refs (
          tg_id integer primary key, ref_by integer not null, rewarded integer not null default 0,
          created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
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

    async def ai_gift(self, tg_id):
        return self._row(self.c.execute("select * from ai_orders where tg_id=? and status='gift' order by id limit 1", (tg_id,)).fetchone())

    async def payments_recent(self):
        return [dict(r) for r in self.c.execute("select nick, stars from payments order by id desc limit 5")]

    # ---- рефералы ----
    async def ref_set(self, tg_id, ref_by):
        if tg_id == ref_by:
            return
        self.c.execute("insert or ignore into refs (tg_id, ref_by) values (?,?)", (tg_id, ref_by))
        self.c.commit()

    async def ref_reward(self, tg_id):
        r = self.c.execute("select ref_by from refs where tg_id=? and rewarded=0", (tg_id,)).fetchone()
        if not r:
            return None
        self.c.execute("update refs set rewarded=1 where tg_id=?", (tg_id,))
        self.c.commit()
        return r[0]

    async def ref_count(self, uid):
        n = self.c.execute("select count(*) from refs where ref_by=? and rewarded=1", (uid,)).fetchone()[0]
        return n + self.c.execute("select count(*) from refs where tg_id=? and rewarded=1", (uid,)).fetchone()[0]

    async def ref_top(self, k=10):
        return [tuple(r) for r in self.c.execute("select ref_by, count(*) c from refs where rewarded=1 group by ref_by order by c desc limit ?", (k,))]

    # ---- выборы мэра ----
    def _mayor_tables(self):
        if getattr(self, "_mt", False):
            return
        self.c.executescript("""
        create table if not exists candidates (
          id integer primary key autoincrement, tg_id integer not null unique, nick text not null, promise text not null,
          status text not null default 'new', created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
        create table if not exists votes (
          tg_id integer primary key, cand_id integer not null, created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
        create table if not exists kv (k text primary key, v text);
        """)
        self.c.commit()
        self._mt = True

    async def kv_get(self, k):
        self._mayor_tables()
        r = self.c.execute("select v from kv where k=?", (k,)).fetchone()
        return r[0] if r else None

    async def kv_set(self, k, v):
        self._mayor_tables()
        if v is None:
            self.c.execute("delete from kv where k=?", (k,))
        else:
            self.c.execute("insert into kv (k, v) values (?,?) on conflict(k) do update set v=excluded.v", (k, str(v)))
        self.c.commit()

    async def cand_by_tg(self, tg_id):
        self._mayor_tables()
        r = self.c.execute("select * from candidates where tg_id=?", (tg_id,)).fetchone()
        return dict(r) if r else None

    async def cand_get(self, cid):
        self._mayor_tables()
        r = self.c.execute("select * from candidates where id=?", (cid,)).fetchone()
        return dict(r) if r else None

    async def cand_add(self, tg_id, nick, promise):
        """Новая заявка (или повторная после отказа). → id"""
        self._mayor_tables()
        self.c.execute("""insert into candidates (tg_id, nick, promise) values (?,?,?)
                          on conflict(tg_id) do update set nick=excluded.nick, promise=excluded.promise, status='new',
                          created_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')""", (tg_id, nick, promise))
        self.c.commit()
        return self.c.execute("select id from candidates where tg_id=?", (tg_id,)).fetchone()[0]

    async def cand_set(self, cid, status):
        self._mayor_tables()
        self.c.execute("update candidates set status=? where id=?", (status, cid))
        self.c.commit()

    async def cands(self):
        """Одобренные кандидаты с голосами, по убыванию голосов."""
        self._mayor_tables()
        return [dict(r) for r in self.c.execute("""select c.id, c.tg_id, c.nick, c.promise, count(v.tg_id) votes from candidates c
            left join votes v on v.cand_id = c.id where c.status='approved' group by c.id order by votes desc, c.id asc""")]

    async def vote_get(self, tg_id):
        self._mayor_tables()
        r = self.c.execute("select cand_id from votes where tg_id=?", (tg_id,)).fetchone()
        return r[0] if r else None

    async def vote_add(self, tg_id, cand_id):
        self._mayor_tables()
        self.c.execute("insert or ignore into votes (tg_id, cand_id) values (?,?)", (tg_id, cand_id))
        self.c.commit()

    async def mayor_reset(self):
        """Новые выборы: старые заявки и голоса — в архив (удаляем)."""
        self._mayor_tables()
        self.c.executescript("delete from votes; delete from candidates;")
        self.c.commit()

    async def cands_new(self):
        """Заявки в мэры, которые ждут проверки."""
        self._mayor_tables()
        return [dict(r) for r in self.c.execute("select * from candidates where status='new' order by id")]
