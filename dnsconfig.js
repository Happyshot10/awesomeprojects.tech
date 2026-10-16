// DNSControl config: builds awesomeprojects.tech from domains/*.json.
// Docs: https://docs.dnscontrol.org  (ES5 only: no arrow functions, let/const)
//
// DNSControl makes Cloudflare match this file exactly. Anything it doesn't know
// about gets DELETED, except the names IGNOREd below. Those are yours to manage
// by hand in the Cloudflare dashboard (root site, www, mail, etc.).

var DOMAIN = "awesomeprojects.tech";
var reserved = require("./reserved.json");

var records = [
  // Hands off the root domain and every reserved name.
  IGNORE("@"),
];
for (var i = 0; i < reserved.length; i++) {
  records.push(IGNORE(reserved[i]));
  records.push(IGNORE("*." + reserved[i]));
}

var files = glob("./domains/", false, ".json");
for (var f = 0; f < files.length; f++) {
  var name = files[f].split("/").pop().replace(/\.json$/, "");
  var r = require(files[f]).records;
  var t, k;

  if (r.CNAME) records.push(CNAME(name, r.CNAME.replace(/\.$/, "") + ".", CF_PROXY_OFF));
  t = r.A || [];
  for (k = 0; k < t.length; k++) records.push(A(name, t[k], CF_PROXY_OFF));
  t = r.AAAA || [];
  for (k = 0; k < t.length; k++) records.push(AAAA(name, t[k], CF_PROXY_OFF));
  t = r.TXT === undefined ? [] : typeof r.TXT === "string" ? [r.TXT] : r.TXT;
  for (k = 0; k < t.length; k++) records.push(TXT(name, t[k]));
  t = r.MX || [];
  for (k = 0; k < t.length; k++) {
    var mx = typeof t[k] === "string" ? { host: t[k] } : t[k];
    records.push(MX(name, mx.priority === undefined ? 10 : mx.priority, mx.host.replace(/\.$/, "") + "."));
  }
}

D(DOMAIN, NewRegistrar("none"), DnsProvider(NewDnsProvider("cloudflare")), DefaultTTL(1), records);
