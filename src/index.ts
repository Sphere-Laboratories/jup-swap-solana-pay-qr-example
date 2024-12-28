import {onRequest} from "firebase-functions/v2/https";
import {buildQrCode} from "./build-qr-code.js";
import {handleGet, handlePost} from "./solana-pay.js";

export const qr = onRequest(buildQrCode);

export const pay = onRequest(async (request, response) => {
  switch (request.method) {
  case "GET":
    return handleGet(response);
  case "POST":
    return handlePost(request, response);
  default:
    response.status(405).json({
      message: "Method not allowed",
    });
  }
});
