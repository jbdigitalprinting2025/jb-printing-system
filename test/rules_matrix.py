#!/usr/bin/env python3
# ============================================================
# JB Digital Printing — Firestore Rules Verification Matrix
# Run AFTER publishing the new firestore.rules in the console.
#   python3 test/rules_matrix.py
# Creates throwaway probe users, checks the permission matrix,
# cleans up after itself. Exits non-zero on any failure.
# ============================================================
import urllib.request, json, time, sys, os

API_KEY = "AIzaSyBIGsv78X8iNm_-BtECfsE9C_DI2JIpeqY"
PROJ = "jb-digitalprinting"

def post(url, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

def get(url, token=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

def patch(url, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

def delete(url, token):
    req = urllib.request.Request(url, method="DELETE", headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

F = f"https://firestore.googleapis.com/v1/projects/{PROJ}/databases/(default)/documents"
A = "https://identitytoolkit.googleapis.com/v1/accounts"
results = []
def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("  PASS " if cond else "  FAIL ") + name + (" — " + detail if detail else ""))

# ---- create probe user ----
email = f"matrix{int(time.time())}@test.local"
s, d = post(f"{A}:signUp?key={API_KEY}", {"email": email, "password": "probe12345", "returnSecureToken": True})
uid, tok = d.get("localId"), d.get("idToken")
print("probe user:", email, uid)

# ================= VIEWER / NO-ROLE (worst case attacker) =================
print("\n== Attacker (brand-new user, no role) ==")
# cannot create own users doc with admin role (escalation must be blocked)
s1, d1 = post(f"{F}/users?documentId={uid}",
              {"fields": {"uid": {"stringValue": uid}, "email": {"stringValue": email},
                          "name": {"stringValue": "attacker"}, "role": {"stringValue": "admin"}}}, tok)
check("CREATE own users doc as ADMIN -> BLOCKED", s1 == 403, f"http {s1} {d1.get('error',{}).get('message','ALLOWED')}")
# can create own doc as viewer
s1b, d1b = post(f"{F}/users?documentId={uid}",
                {"fields": {"uid": {"stringValue": uid}, "email": {"stringValue": email},
                            "name": {"stringValue": "attacker"}, "role": {"stringValue": "viewer"}}}, tok)
check("CREATE own users doc as VIEWER -> allowed", s1b == 200, f"http {s1b}")
# cannot self-promote (update own role)
s1c, d1c = patch(f"{F}/users/{uid}?updateMask.fieldPaths=role",
                {"fields": {"role": {"stringValue": "admin"}}}, tok)
check("UPDATE own role to admin -> BLOCKED", s1c == 403, f"http {s1c} {d1c.get('error',{}).get('message','ALLOWED')}")
# read sales allowed
s2, d2 = get(f"{F}/sales?pageSize=1", tok)
check("READ sales -> allowed", s2 == 200, f"http {s2}")
# write sales blocked
s3, d3 = post(f"{F}/sales?documentId=_m_att_sale",
              {"fields": {"total": {"doubleValue": 100}, "amountPaid": {"doubleValue": 100},
                          "paymentStatus": {"stringValue": "Paid"}, "transactionId": {"stringValue": "S-MATRIX-ATT"}}}, tok)
check("WRITE sale -> BLOCKED", s3 == 403, f"http {s3} {d3.get('error',{}).get('message','ALLOWED')}")
# audit read blocked
s4, d4 = get(f"{F}/audit_logs?pageSize=1", tok)
check("READ audit_logs -> BLOCKED", s4 == 403, f"http {s4} {d4.get('error',{}).get('message','ALLOWED')}")
# cannot read other users
s5, d5 = get(f"{F}/users", tok)
check("READ all users -> BLOCKED", s5 == 403, f"http {s5} {d5.get('error',{}).get('message','ALLOWED')}")
# cannot create a sale with negative balance (rules validation)
s6, d6 = post(f"{F}/sales?documentId=_m_att_sale2",
              {"fields": {"total": {"doubleValue": 100}, "amountPaid": {"doubleValue": 200},
                          "paymentStatus": {"stringValue": "Partial"}, "transactionId": {"stringValue": "S-MATRIX-ATT2"}}}, tok)
check("WRITE sale with paid > total -> BLOCKED (validation)", s6 == 403, f"http {s6} {d6.get('error',{}).get('message','ALLOWED')}")

# ================= STAFF (optional — created by the OWNER via the app) =================
# The app's Settings → User Management → Add User creates the auth account AND
# the users doc with role=staff. Self-registration can only create viewers, so
# run this part with a staff account created by the owner:
#   STAFF_EMAIL=staff@yourbusiness.com STAFF_PASS='pw' python3 test/rules_matrix.py
print("\n== Staff ==")
staff_email = os.environ.get("STAFF_EMAIL", "")
staff_pass = os.environ.get("STAFF_PASS", "")
if not staff_email or not staff_pass:
    print("  SKIP staff checks — provide STAFF_EMAIL/STAFF_PASS (owner-created account) to run")
else:
    s, d = post(f"{A}:signInWithPassword?key={API_KEY}", {"email": staff_email, "password": staff_pass, "returnSecureToken": True})
    staff_tok = d.get("idToken")
    staff_uid = d.get("localId")
    if not staff_tok:
        check("STAFF sign-in", False, d.get("error", {}).get("message", "?"))
    else:
        # staff: read sales OK
        s, d = get(f"{F}/sales?pageSize=1", staff_tok)
        check("STAFF READ sales -> allowed", s == 200, f"http {s}")
        # staff: create sale OK (valid)
        s, d = post(f"{F}/sales?documentId=_m_staff_sale",
                    {"fields": {"total": {"doubleValue": 250.5}, "amountPaid": {"doubleValue": 250.5},
                                "paymentStatus": {"stringValue": "Paid"}, "transactionId": {"stringValue": "S-MATRIX-STAFF"}}}, staff_tok)
        check("STAFF WRITE sale -> allowed", s == 200, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # staff: audit read blocked
        s, d = get(f"{F}/audit_logs?pageSize=1", staff_tok)
        check("STAFF READ audit_logs -> BLOCKED", s == 403, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # staff: create own audit event allowed (userId must match)
        s, d = post(f"{F}/audit_logs?documentId=_m_staff_audit",
                    {"fields": {"userId": {"stringValue": staff_uid}, "userName": {"stringValue": "staff"},
                                "action": {"stringValue": "test"}, "recordType": {"stringValue": "probe"}}}, staff_tok)
        check("STAFF CREATE audit event (own userId) -> allowed", s == 200, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # staff: spoofed audit (someone else's userId) blocked
        s, d = post(f"{F}/audit_logs?documentId=_m_staff_audit2",
                    {"fields": {"userId": {"stringValue": "someone-else"}, "userName": {"stringValue": "spoof"},
                                "action": {"stringValue": "test"}, "recordType": {"stringValue": "probe"}}}, staff_tok)
        check("STAFF CREATE audit with spoofed actor -> BLOCKED", s == 403, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # staff: cannot change own role
        s, d = patch(f"{F}/users/{staff_uid}?updateMask.fieldPaths=role",
                    {"fields": {"role": {"stringValue": "admin"}}}, staff_tok)
        check("STAFF self-promote to admin -> BLOCKED", s == 403, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # staff: cannot create another user's doc
        s, d = post(f"{F}/users?documentId=someone-else",
                    {"fields": {"uid": {"stringValue": "someone-else"}, "role": {"stringValue": "admin"}}}, staff_tok)
        check("STAFF create ANOTHER user as admin -> BLOCKED", s == 403, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # staff: cannot delete inventory movement history (immutable)
        s = delete(f"{F}/inventory_transactions/_m_staff_tx_del", staff_tok)
        check("STAFF DELETE inventory movement -> BLOCKED (immutable)", s == 403, f"http {s}")
        # staff: cannot read users list
        s, d = get(f"{F}/users", staff_tok)
        check("STAFF READ all users -> BLOCKED", s == 403, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # staff: inventory tx create allowed + newStock >= 0 enforced
        s, d = post(f"{F}/inventory_transactions?documentId=_m_staff_tx",
                    {"fields": {"itemId": {"stringValue": "x"}, "type": {"stringValue": "usage"},
                                "prevStock": {"doubleValue": 10}, "newStock": {"doubleValue": 5},
                                "qty": {"doubleValue": 5}}}, staff_tok)
        check("STAFF CREATE inventory movement -> allowed", s == 200, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        s, d = post(f"{F}/inventory_transactions?documentId=_m_staff_tx2",
                    {"fields": {"itemId": {"stringValue": "x"}, "type": {"stringValue": "usage"},
                                "prevStock": {"doubleValue": 10}, "newStock": {"doubleValue": -5},
                                "qty": {"doubleValue": 15}}}, staff_tok)
        check("STAFF CREATE movement with negative stock -> BLOCKED", s == 403, f"http {s} {d.get('error',{}).get('message','ALLOWED')}")
        # cleanup staff probes
        for path in ["sales/_m_staff_sale", "audit_logs/_m_staff_audit", "inventory_transactions/_m_staff_tx", "inventory_transactions/_m_staff_tx2"]:
            delete(f"{F}/{path}", staff_tok)

# ================= cleanup =================
print("\n== cleanup ==")
for path, t in [(f"users/{uid}", tok), ("sales/_m_att_sale", tok)]:
    delete(f"{F}/{path}", t)
if 'staff_tok' in dir() and staff_tok:
    for path in ["sales/_m_staff_sale", "audit_logs/_m_staff_audit", "inventory_transactions/_m_staff_tx", "inventory_transactions/_m_staff_tx2"]:
        delete(f"{F}/{path}", staff_tok)
    post(f"{A}:delete?key={API_KEY}", {"idToken": staff_tok})
post(f"{A}:delete?key={API_KEY}", {"idToken": tok})
print("cleanup done")

fails = [r for r in results if not r[1]]
print(f"\n=== MATRIX RESULT: {len(results)-len(fails)}/{len(results)} passed ===")
sys.exit(1 if fails else 0)
