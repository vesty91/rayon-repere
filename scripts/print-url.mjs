import os from "os";

function localIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "IP_DU_PC";
}

const ip = localIp();
const port = process.env.PORT || "5173";
console.log(`
========================================
  RAYON REPERE — accès téléphone
========================================

  Sur le téléphone (même Wi-Fi) :

    https://${ip}:${port}

  Acceptez l'avertissement de certificat.
  N'utilisez PAS localhost sur le téléphone.

========================================
`);
