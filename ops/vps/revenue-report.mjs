// Read-only REVENUE + CLIENTS report for the Axie tracker.
//
// Runs INSIDE the axie_backend container (it has better-sqlite3 and the /data
// volume mounted). Opens access.db READ-ONLY and prints a revenue total + a
// client roster. Adds ZERO network attack surface: it is reachable only through
// your SSH access to the box (via ops/vps/report.sh or `docker exec`), never
// over HTTP and never from the browser/frontend.
//
// Manual / off-platform revenue is recorded in the whitelist `reason` field
// using this convention (so we avoid a schema change):
//
//   paid:<amount><CUR> <YYYY-MM-DD> via:<method> contact:<handle> [note:...]
//   e.g.  paid:20USDC 2026-05-29 via:manual contact:@neo note:returning client
//
// Rows whose reason does not match are listed as LEGACY/unparsed so you can
// update them. On-chain self-serve payments are read from consumed_tx directly.

(async () => {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = (process.env.DATA_DIR || '/data') + '/access.db';
  const db = new Database(dbPath, { readonly: true });
  const now = Date.now();
  const DAY = 86400000;
  const dec = Number(process.env.USDC_DECIMALS || 6);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const daysLeft = (ms) => Math.floor((ms - now) / DAY);

  const subs = db.prepare('SELECT * FROM subscriptions').all();
  const tx = db.prepare('SELECT * FROM consumed_tx ORDER BY observed_at').all();
  const wl = db.prepare('SELECT * FROM whitelist ORDER BY until').all();

  const amountRe = /paid:\s*([\d.]+)\s*([a-z]{2,5})/i;
  const dateRe = /\b(\d{4}-\d{2}-\d{2})\b/;
  const viaRe = /via:\s*(\S+)/i;
  const contactRe = /contact:\s*(\S+)/i;
  const parse = (reason) => {
    const r = reason || '';
    const m = r.match(amountRe);
    return {
      parsed: !!m,
      amount: m ? Number(m[1]) : null,
      cur: m ? m[2].toUpperCase() : null,
      date: (r.match(dateRe) || [])[1] || null,
      via: (r.match(viaRe) || [])[1] || null,
      contact: (r.match(contactRe) || [])[1] || null,
    };
  };

  const onchainUsdc = tx.reduce((a, t) => a + Number(t.amount || 0), 0) / 10 ** dec;
  const clients = wl.map((w) => ({ ...w, ...parse(w.reason) }));
  const manualByCur = {};
  clients.filter((c) => c.parsed).forEach((c) => {
    manualByCur[c.cur] = (manualByCur[c.cur] || 0) + c.amount;
  });

  const line = '='.repeat(72);
  console.log(line);
  console.log('AXIE — REVENUE & CLIENTS   (read-only, SSH/docker only)');
  console.log('as of', new Date(now).toISOString(), '·', dbPath);
  console.log(line);

  console.log('\nREVENUE');
  console.log(`  on-chain self-serve : ${onchainUsdc.toFixed(2)} USDC  (${tx.length} payment${tx.length === 1 ? '' : 's'})`);
  const manualStr = Object.keys(manualByCur).length
    ? Object.entries(manualByCur).map(([c, a]) => `${a} ${c}`).join(', ')
    : 'none recorded via the paid: convention yet';
  console.log(`  manual/off-platform : ${manualStr}`);

  console.log('\nPAYING CLIENTS (on-chain subscriptions)');
  if (!subs.length) console.log('  (none yet)');
  subs.forEach((s) => console.log(
    `  ${s.wallet}  ${s.plan}  exp ${day(s.expires_at)}  (${daysLeft(s.expires_at)}d)  ${s.expires_at > now ? 'ACTIVE' : 'EXPIRED'}`));

  console.log('\nWHITELIST / MANUAL & COMPED CLIENTS');
  if (!clients.length) console.log('  (none)');
  clients.forEach((c) => {
    const status = c.until > now ? (daysLeft(c.until) <= 3 ? 'EXPIRING' : 'active') : 'EXPIRED';
    if (c.parsed) {
      console.log(`  ${c.wallet}  ${c.amount} ${c.cur}  paid ${c.date || '?'}  via ${c.via || '?'}  ${c.contact || '-'}  exp ${day(c.until)} (${daysLeft(c.until)}d)  [${status}]`);
    } else {
      console.log(`  ${c.wallet}  exp ${day(c.until)} (${daysLeft(c.until)}d)  [${status}]  LEGACY reason: "${c.reason}"`);
    }
  });

  const activeCount = clients.filter((c) => c.until > now).length + subs.filter((s) => s.expires_at > now).length;
  const expiring = clients.filter((c) => c.until > now && daysLeft(c.until) <= 3);
  const legacy = clients.filter((c) => !c.parsed);
  console.log('\nATTENTION');
  console.log(`  active clients          : ${activeCount}`);
  console.log(`  expiring within 3 days  : ${expiring.length}${expiring.length ? ' -> ' + expiring.map((c) => c.wallet.slice(0, 10) + '…').join(', ') : ''}`);
  console.log(`  rows missing paid: tag  : ${legacy.length}${legacy.length ? '  (update reason to record revenue)' : ''}`);
  console.log(line);
})().catch((e) => { console.error('REPORT_ERR', e.message); process.exit(1); });
