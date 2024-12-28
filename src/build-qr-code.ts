import QRCode from "qrcode";
import type {Request, Response} from "express";

export const buildQrCode = async (request: Request, response: Response) => {
  if (request.method !== "GET") {
    response.status(405).json({
      message: "Method not allowed",
    });
    return;
  }
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

  const url = `https://pay-lsltacmgzq-uc.a.run.app?recipient=${encodeURIComponent(
    recipient
  )}&uiAmount=${encodeURIComponent(uiAmount)}&inputMint=${encodeURIComponent(
    inputMint
  )}`;

  response.set("Content-Type", "image/png");
  response.send(
    await QRCode.toBuffer(`solana:${encodeURIComponent(url)}`, {
      width: 1024,
    })
  );
};
