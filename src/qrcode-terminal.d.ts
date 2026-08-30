declare module "qrcode-terminal" {
  export function generate(
    input: string,
    opts?: { small?: boolean },
    cb?: (qr: string) => void,
  ): void;
}
