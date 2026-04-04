CREATE TABLE users (
  telegram_id      INTEGER  PRIMARY KEY,
  username         TEXT,
  ad_unlocked_at   INTEGER  DEFAULT 0,
  expiry_notified  INTEGER  DEFAULT 0,
  created_at       INTEGER  DEFAULT (unixepoch())
);

CREATE TABLE subscriptions (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER  REFERENCES users(telegram_id) ON DELETE CASCADE,
  board       TEXT     NOT NULL,
  created_at  INTEGER  DEFAULT (unixepoch()),
  UNIQUE(user_id, board)
);

CREATE TABLE subscription_filters (
  subscription_id  INTEGER  PRIMARY KEY
                   REFERENCES subscriptions(id) ON DELETE CASCADE,
  keywords         TEXT     DEFAULT '[]'
);

CREATE TABLE board_snapshots (
  board            TEXT     PRIMARY KEY,
  last_article_id  TEXT,
  last_crawled_at  INTEGER  DEFAULT (unixepoch())
);

CREATE TABLE boards (
  name          TEXT     PRIMARY KEY,
  display_name  TEXT,
  is_popular    INTEGER  DEFAULT 0,
  is_verified   INTEGER  DEFAULT 0
);

CREATE TABLE crawl_queue (
  board         TEXT     PRIMARY KEY,
  status        TEXT     DEFAULT 'pending',
  locked_at     INTEGER,
  dispatched_at INTEGER  DEFAULT (unixepoch())
);

CREATE TABLE pending_notifications (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER  REFERENCES users(telegram_id),
  board           TEXT     NOT NULL,
  article_id      TEXT     NOT NULL,
  article_title   TEXT,
  article_url     TEXT,
  article_replies INTEGER  DEFAULT 0,
  board_rank      INTEGER,
  status          TEXT     DEFAULT 'pending',
  created_at      INTEGER  DEFAULT (unixepoch()),
  processed_at    INTEGER,
  retry_count     INTEGER  DEFAULT 0,
  UNIQUE(user_id, article_id)
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_board ON subscriptions(board);
CREATE INDEX idx_pending_notifications_status ON pending_notifications(status, created_at);
CREATE INDEX idx_crawl_queue_status ON crawl_queue(status);

INSERT INTO boards (name, display_name, is_popular) VALUES
  ('Gossiping',    '八卦',         1),
  ('Stock',        '股票',         1),
  ('Baseball',     '棒球',         1),
  ('NBA',          '籃球',         1),
  ('movie',        '電影',         1),
  ('LoL',          '英雄聯盟',     1),
  ('MobileComm',   '手機',         1),
  ('car',          '汽車',         1),
  ('Tech_Job',     '科技業求職',   1),
  ('Soft_Job',     '軟體工作',     1),
  ('WomenTalk',    '女孩版',       1),
  ('Boy-Girl',     '男女版',       1),
  ('joke',         '笑話',         1),
  ('C_Chat',       '西斯',         1),
  ('HatePolitics', '政黑',         1),
  ('creditcard',   '信用卡',       1),
  ('home-sale',    '房屋買賣',     1),
  ('Rent_apart',   '租屋',         1);
