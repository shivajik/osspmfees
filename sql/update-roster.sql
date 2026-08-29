-- Adds a phone column and updates each existing row's email/name/phone to
-- the real admin/accountant roster. Run in the Supabase SQL editor.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
-- Super Admin 1 (existing account, email swapped)
UPDATE "User" SET name = 'Gaikwad N.G.',   email = 'ngkishor67@gmail.com',        phone = '7588023221'  WHERE email = 'super@osspmandal.com';

-- Late. Vimalbai G. Gaikwad Secondary School (VGGSS)
UPDATE "User" SET name = 'Daspute G.M.',   email = 'ganeshdaspute91@gmail.com',   phone = '8208654865'  WHERE email = 'admin.vggss@osspmandal.com';
UPDATE "User" SET name = 'Jawale S.V.',    email = 'sanjayjawale1512@gmail.com',  phone = '8459180490'  WHERE email = 'accountant.vggss@osspmandal.com';

-- Late. Vimalbai G. Gaikwad Sec & Higher Secondary School (VGHSS)
-- (Daspute G.M.'s email already used for VGGSS above — one login, one institute —
-- so VGHSS's admin row is left as-is; only its accountant is updated.)
UPDATE "User" SET name = 'Mhaske S.K.',    email = 'somnathmhaske94@gmail.com',   phone = '7620988333'  WHERE email = 'accountant.vghss@osspmandal.com';

-- Adarsh Junior College (AJC)
UPDATE "User" SET name = 'Karale A.D.',    email = 'ashokkarale63@gmail.com',     phone = '9763510140'  WHERE email = 'admin.ajc@osspmandal.com';
UPDATE "User" SET name = 'Kharat S.W.',    email = 'sokharat143@gmail.com',       phone = '9807623333'  WHERE email = 'accountant.ajc@osspmandal.com';

-- Late. Gangadhar Patil English School (GPES)
UPDATE "User" SET name = 'Chavan S.A.',    email = 'chavansharad644@gmail.com',   phone = '8208998751'  WHERE email = 'admin.gpes@osspmandal.com';
UPDATE "User" SET name = 'Waghmare P.N.',  email = 'popatwaghmare19191@gmail.com',phone = '9021188055'  WHERE email = 'accountant.gpes@osspmandal.com';

-- Late. Kishanrao Dhanve Secondary School (KDSS)
UPDATE "User" SET name = 'Chavan P.S.',    email = 'pschavan1981@gmail.com',      phone = '7588023219'  WHERE email = 'admin.kdss@osspmandal.com';
UPDATE "User" SET name = 'Mhaske S.B.',    email = 'sudammhaske927@gmail.com',    phone = '9834761838'  WHERE email = 'accountant.kdss@osspmandal.com';

-- Secondary School, Rui (SSR)
UPDATE "User" SET name = 'Patil K.S.',     email = 'sohamkpatil82@gmail.com',     phone = '9096611872'  WHERE email = 'admin.ssr@osspmandal.com';
UPDATE "User" SET name = 'Gahal N.M.',     email = 'mvrui2008g@gmail.com',        phone = '8208365247'  WHERE email = 'accountant.ssr@osspmandal.com';

-- Shree Shaneshwar Secondary School (SSSS)
-- (Sohale Y.B.'s email is used for Super Admin 2 below — one login, one role —
-- so SSSS's admin row is left as-is; only its accountant is updated.)
UPDATE "User" SET name = 'Raut C.L.',      email = 'rautcl87@gmail.com',          phone = '8378884687'  WHERE email = 'accountant.ssss@osspmandal.com';

-- Shree Shaneshwar Higher Secondary School (SSHSS)
-- (same reason as SSSS above — admin row left as-is, accountant updated.)
UPDATE "User" SET name = 'Dhanve A.S.',    email = 'ssmvlj@rediffmail.com',       phone = '9527687770'  WHERE email = 'accountant.sshss@osspmandal.com';

-- Om Balak Mandir (OBM) = Om Prathmik Vidya Mandir — one institute, two
-- admin/accountant pairs. First pair updates the existing row; the second
-- pair is inserted further below since there's no existing row for it.
UPDATE "User" SET name = 'Jawale S.S.',    email = 'jawalesurekha494@gmail.com',  phone = '9405109642'  WHERE email = 'admin.obm@osspmandal.com';
UPDATE "User" SET name = 'Videkar A.R.',   email = 'ashwinividekar@gmail.com',    phone = '9404047915'  WHERE email = 'accountant.obm@osspmandal.com';

-- Om Secondary School (OSS) = Om Madhyamik Vidyalaya
UPDATE "User" SET name = 'Game S.D.',      email = 'shankargame970@gmail.com',    phone = '9158664125'  WHERE email = 'admin.oss@osspmandal.com';
UPDATE "User" SET name = 'Khandare P.R.',  email = 'khandarepratiksha@gmail.com', phone = '9422464624'  WHERE email = 'accountant.oss@osspmandal.com';

-- The Tesla High School (THS)
UPDATE "User" SET name = 'Lavange D.B.',   email = 'ravikiranedu101@gmail.com',   phone = '8308123101'  WHERE email = 'admin.ths@osspmandal.com';
UPDATE "User" SET name = 'Khandagale R.A.',email = 'rkpatil4272@gmail.com',       phone = '8805123101'  WHERE email = 'accountant.ths@osspmandal.com';

-- Sai English School, Rui (SESR) — not in the roster table, left untouched.

-- ---------------------------------------------------------------------
-- These 3 people have no existing placeholder row to UPDATE, so they're
-- inserted as new rows: Sohale Y.B. as the second super admin, and Om Balak
-- Mandir / Om Prathmik Vidya Mandir's second admin + accountant pair.
-- passwordHash below is a valid bcrypt hash of the same shared seed
-- password ("Password123!") every other seeded account currently has.
-- ---------------------------------------------------------------------

INSERT INTO "User" (id, email, name, phone, "passwordHash", role, "instituteId", active, "failedLoginCount", "createdAt", "updatedAt")
VALUES ('usr_ysohale_rediffmail_com', 'ysohale@rediffmail.com', 'Sohale Y.B.', '9800560688',
        '$2b$10$E4v8H7jo2eZsGvQZCw6URu5cjsbQXaXGa4fXJ4iNCXZJCMQS5E3x.', 'SUPER_ADMIN', NULL, true, 0, now(), now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO "User" (id, email, name, phone, "passwordHash", role, "instituteId", active, "failedLoginCount", "createdAt", "updatedAt")
VALUES ('usr_sambhajimali152_gmail_com', 'sambhajimali152@gmail.com', 'Mali S.W.', '8381074440',
        '$2b$10$E4v8H7jo2eZsGvQZCw6URu5cjsbQXaXGa4fXJ4iNCXZJCMQS5E3x.', 'INSTITUTE_ADMIN', 'inst_obm', true, 0, now(), now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO "User" (id, email, name, phone, "passwordHash", role, "instituteId", active, "failedLoginCount", "createdAt", "updatedAt")
VALUES ('usr_sunilmhaske33_gmail_com', 'sunilmhaske33@gmail.com', 'Mhaske S.R.', '9922544494',
        '$2b$10$E4v8H7jo2eZsGvQZCw6URu5cjsbQXaXGa4fXJ4iNCXZJCMQS5E3x.', 'ACCOUNTANT', 'inst_obm', true, 0, now(), now())
ON CONFLICT (email) DO NOTHING;
