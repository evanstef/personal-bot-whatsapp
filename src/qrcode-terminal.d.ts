declare module "qrcode-terminal" {
  interface QrcodeTerminal {
    generate(input: string, opts?: { small?: boolean }, cb?: (qr: string) => void): void;
  }
  const qrcode: QrcodeTerminal;
  export default qrcode;
}
