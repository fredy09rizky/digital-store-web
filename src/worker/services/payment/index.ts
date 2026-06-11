import type { AppBindings } from "../../env";
import { PakasirPaymentProvider } from "./pakasir-provider";

export class PaymentConfigError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Ambil instance Pakasir provider. Throw PaymentConfigError jika kredensial
 * Pakasir belum di-set. Aplikasi ini tidak punya provider lain dan tidak
 * mendukung mode mock.
 */
export function pakasirProvider(env: AppBindings): PakasirPaymentProvider {
  if (!env.PAKASIR_API_KEY || !env.PAKASIR_PROJECT) {
    throw new PaymentConfigError(
      "pakasir_not_configured",
      "Pakasir belum dikonfigurasi. Set PAKASIR_API_KEY dan PAKASIR_PROJECT.",
    );
  }
  return new PakasirPaymentProvider({
    apiKey: env.PAKASIR_API_KEY,
    project: env.PAKASIR_PROJECT,
  });
}

export * from "./types";
