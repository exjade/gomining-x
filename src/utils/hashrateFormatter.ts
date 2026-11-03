/**
 * Formateador dinámico de hashrate según el estándar cripto (PoW / PoUW):
 * - < 1,000 TH/s: Mantiene unidad en TH/s (Terahash por segundo).
 * - >= 1,000 TH/s y < 1,000,000 TH/s: Escala dinámicamente a PH/s (Petahash por segundo: 1 PH/s = 1,000 TH/s).
 * - >= 1,000,000 TH/s: Escala dinámicamente a EH/s (Exahash por segundo: 1 EH/s = 1,000,000 TH/s).
 */

export interface FormattedHashrate {
  value: string;
  unit: string;
  full: string;
  numericValue: number;
}

export function formatHashrate(
  ths: number | null | undefined, 
  decimals: number = 1
): FormattedHashrate {
  const num = typeof ths === 'number' && !isNaN(ths) ? Math.max(0, ths) : 0;

  // 1 EH/s = 1,000,000 TH/s
  if (num >= 1_000_000) {
    const ehVal = num / 1_000_000;
    const valueStr = ehVal.toLocaleString('en-US', { 
      minimumFractionDigits: 1, 
      maximumFractionDigits: 2 
    });
    return {
      value: valueStr,
      unit: 'EH/s',
      full: `${valueStr} EH/s`,
      numericValue: ehVal
    };
  }

  // 1 PH/s = 1,000 TH/s
  if (num >= 1_000) {
    const phVal = num / 1_000;
    const valueStr = phVal.toLocaleString('en-US', { 
      minimumFractionDigits: 1, 
      maximumFractionDigits: 2 
    });
    return {
      value: valueStr,
      unit: 'PH/s',
      full: `${valueStr} PH/s`,
      numericValue: phVal
    };
  }

  // < 1,000 TH/s
  const thStr = num.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
  return {
    value: thStr,
    unit: 'TH/s',
    full: `${thStr} TH/s`,
    numericValue: num
  };
}

/**
 * Retorna versión compacta en una sola cadena.
 * Ejemplo: 938490.3 -> "938.49 PH/s"
 */
export function formatHashrateCompact(ths: number | null | undefined, decimals: number = 1): string {
  return formatHashrate(ths, decimals).full;
}
