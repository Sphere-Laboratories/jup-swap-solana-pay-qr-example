import QRCode from "qrcode";
import type {Request, Response} from "express";

/**
 * Generates a QR code for a Solana payment URL
 */
export const buildQrCode = async (request: Request, response: Response) => {
  // Only allow GET requests
  if (request.method !== "GET") {
    response.status(405).json({
      message: "Method not allowed",
    });
    return;
  }

  // recipient: The Solana wallet address that will receive the USDC
  // uiAmount: The amount of USDC to be transferred (if transferring 1 USDC, uiAmount should be "1")
  // inputMint: The mint address of the token that will be swapped for USDC
  const {recipient, uiAmount, inputMint} = request.query;

  if (
    typeof recipient !== "string" ||
    typeof uiAmount !== "string" ||
    typeof inputMint !== "string"
  ) {
    response.status(400).json({
      message:
        // eslint-disable-next-line max-len
        "\"recipient\", \"uiAmount\" and \"inputMint\" query params are required",
    });
    return;
  }

  // Construct the payment URL with encoded parameters
  // This URL points to the logic in "solana-pay.ts" that will build the transaction
  const url = `https://pay-lsltacmgzq-uc.a.run.app?recipient=${encodeURIComponent(
    recipient
  )}&uiAmount=${encodeURIComponent(uiAmount)}&inputMint=${encodeURIComponent(
    inputMint
  )}`;

  // Set response content type to PNG image
  response.set("Content-Type", "image/png");

  // Generate and send the QR code
  // The QR code contains a solana: protocol URL that will open in mobile wallets
  // The width is set to 1024 pixels for high resolution
  response.send(
    await QRCode.toBuffer(`solana:${encodeURIComponent(url)}`, {
      width: 1024,
    })
  );
};
