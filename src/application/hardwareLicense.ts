import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const MODULE_CODE_GLOBAL = "SAFE_ERP_GLOBAL";
export const SECRET_SALT = Buffer.from("SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991", "utf-8");

const progData = process.env.PROGRAMDATA || path.join(os.homedir(), "AppData", "Roaming");
export const LICENSE_DIR = path.join(progData, "SAFE_ERP_Tunisie");
export const LICENSE_FILE = path.join(LICENSE_DIR, "license.dat");

export function getHardwareId(): string {
  try {
    // 1. Tenter d'obtenir la signature standardisée commune avec la suite Python
    const { execSync } = require('child_process');
    const out = execSync('python -c "import uuid, socket, sys, hashlib; raw = f\'{uuid.getnode()}-{socket.gethostname()}-{sys.platform}\'.encode(\'utf-8\'); print(\'HW-\' + hashlib.sha256(raw).hexdigest()[:12].upper())"', { encoding: 'utf-8', timeout: 1500 });
    if (out && out.trim().startsWith('HW-')) {
      return out.trim();
    }
  } catch {
    // Fallback natif Node.js
  }

  try {
    const interfaces = os.networkInterfaces();
    let mac = "";
    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (netList) {
        for (const net of netList) {
          if (!net.internal && net.mac && net.mac !== "00:00:00:00:00:00") {
            mac = net.mac;
            break;
          }
        }
      }
      if (mac) break;
    }
    const raw = `${mac || 'MAC-DEFAULT'}-${os.hostname()}-${os.platform()}`;
    const hash = crypto.createHash('sha256').update(raw, 'utf-8').digest('hex').toUpperCase();
    return `HW-${hash.substring(0, 12)}`;
  } catch {
    return "HW-F34C5F44A5F3";
  }
}

export function computeValidLicense(moduleCode: string, hwId: string, expDateStr: string): string {
  const cleanExp = expDateStr.replace(/-/g, "");
  const payload = Buffer.from(`${moduleCode.trim().toUpperCase()}|${hwId.trim().toUpperCase()}|${cleanExp}`, 'utf-8');
  const hmac = crypto.createHmac('sha256', SECRET_SALT).update(payload).digest('hex').toUpperCase();
  const parts = [
    hmac.substring(0, 4),
    hmac.substring(4, 8),
    hmac.substring(8, 12),
    hmac.substring(12, 16)
  ];
  return `SAFE-${cleanExp}-${parts.join('-')}`;
}

export function verifyLicenseKey(key: string, moduleCode: string, hwId: string): { valid: boolean; info: string } {
  try {
    const parts = key.trim().toUpperCase().split('-');
    if (parts.length !== 6 || parts[0] !== 'SAFE') {
      return { valid: false, info: 'Format de clé invalide (Ex: SAFE-YYYYMMDD-XXXX-XXXX-XXXX-XXXX)' };
    }
    const expStr = parts[1]; // YYYYMMDD
    const year = parseInt(expStr.substring(0, 4), 10);
    const month = parseInt(expStr.substring(4, 6), 10) - 1;
    const day = parseInt(expStr.substring(6, 8), 10);
    const expDate = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expDate < today) {
      return { valid: false, info: `Licence expirée le ${expDate.toISOString().slice(0, 10)}` };
    }

    // Accepter la clé si elle valide soit le module spécifique, soit la clé globale SAFE_ERP_GLOBAL
    const expectedKey = computeValidLicense(moduleCode, hwId, expStr);
    const expectedGlobalKey = computeValidLicense(MODULE_CODE_GLOBAL, hwId, expStr);

    if (key.trim().toUpperCase() === expectedKey || key.trim().toUpperCase() === expectedGlobalKey) {
      return { valid: true, info: `Licence active jusqu'au ${expDate.toISOString().slice(0, 10)}` };
    }

    return { valid: false, info: 'Clé non valide pour ce PC (Hardware ID ou module incompatible)' };
  } catch (err: any) {
    return { valid: false, info: `Erreur de vérification: ${err.message}` };
  }
}

export function checkSystemLicense(moduleCode = MODULE_CODE_GLOBAL): {
  activated: boolean;
  hardwareId: string;
  info: string;
  licenseKey?: string;
} {
  const hwId = getHardwareId();
  if (!fs.existsSync(LICENSE_DIR)) {
    try { fs.mkdirSync(LICENSE_DIR, { recursive: true }); } catch {}
  }

  // Si pas de fichier de licence, on crée une licence d'évaluation active jusqu'à fin 2027
  if (!fs.existsSync(LICENSE_FILE)) {
    const trialKey = computeValidLicense(moduleCode, hwId, "20271231");
    try { fs.writeFileSync(LICENSE_FILE, trialKey, 'utf-8'); } catch {}
  }

  try {
    const key = fs.readFileSync(LICENSE_FILE, 'utf-8').trim();
    const res = verifyLicenseKey(key, moduleCode, hwId);
    return {
      activated: res.valid,
      hardwareId: hwId,
      info: res.info,
      licenseKey: key
    };
  } catch {
    return {
      activated: false,
      hardwareId: hwId,
      info: 'Fichier de licence inaccessible'
    };
  }
}

export function saveSystemLicense(key: string, moduleCode = MODULE_CODE_GLOBAL): { success: boolean; message: string } {
  const hwId = getHardwareId();
  const res = verifyLicenseKey(key, moduleCode, hwId);
  if (!res.valid) {
    return { success: false, message: res.info };
  }
  try {
    if (!fs.existsSync(LICENSE_DIR)) {
      fs.mkdirSync(LICENSE_DIR, { recursive: true });
    }
    fs.writeFileSync(LICENSE_FILE, key.trim().toUpperCase(), 'utf-8');
    return { success: true, message: `Licence activée avec succès (${res.info})` };
  } catch (err: any) {
    return { success: false, message: `Impossible d'enregistrer la licence: ${err.message}` };
  }
}
