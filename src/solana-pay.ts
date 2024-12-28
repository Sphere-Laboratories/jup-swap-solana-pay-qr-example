import axios from "axios";
import type {Response, Request} from "express";
import {Big} from "big.js";
import {
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  createSolanaRpc,
  decompileTransactionMessageFetchingLookupTables,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  getProgramDerivedAddress,
  getAddressEncoder,
  Address,
  compileTransaction,
  getBase64EncodedWireTransaction,
  appendTransactionMessageInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

const SOLANA_USDC_MINT_ADDRESS =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address;
const RPC_URL = "https://susan-gdzl57-fast-mainnet.helius-rpc.com";
const rpc = createSolanaRpc(RPC_URL);

type SwapTransactionResponse = {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationType: {
    computeBudget: {
      microLamports: number;
      estimatedMicroLamports: number;
    };
  };
  computeUnitLimit: number;
};

export const handleGet = async (response: Response) => {
  const label = "Solana Pay QR Jup Swap demo";
  const icon = "https://spherepay.co/assets/sphere-icon.svg";

  response.status(200).send({
    label,
    icon,
  });
};

export const handlePost = async (request: Request, response: Response) => {
  const {uiAmount, inputMint, recipient} = request.query;
  const {account} = request.body;

  const quoteResponse = await axios
    .get("https://quote-api.jup.ag/v6/quote", {
      params: {
        inputMint,
        outputMint: SOLANA_USDC_MINT_ADDRESS,
        // eslint-disable-next-line new-cap
        amount: Big(uiAmount as string)
          .times(10 ** 6)
          .round(0, 0)
          .toFixed(),
        swapMode: "ExactOut",
        restrictIntermediateTokens: true,
      },
    })
    .then((res) => res.data);

  const [ataAddress] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      getAddressEncoder().encode(recipient as Address),
      getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS),
      getAddressEncoder().encode(SOLANA_USDC_MINT_ADDRESS),
    ],
  });
  const swapTransactionResponse = await axios
    .post<SwapTransactionResponse>("https://quote-api.jup.ag/v6/swap", {
      quoteResponse,
      userPublicKey: account,
      useSharedAccounts: true,
      destinationTokenAccount: ataAddress,
    })
    .then((res) => res.data);

  const swapTransactionBuf = Buffer.from(
    swapTransactionResponse.swapTransaction,
    "base64"
  );

  const transaction = getTransactionDecoder().decode(swapTransactionBuf);
  const compiledTransactionMessage =
    getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const decompiledTransactionMessage =
    await decompileTransactionMessageFetchingLookupTables(
      compiledTransactionMessage,
      rpc,
      {commitment: "confirmed"}
    );

  const transactionMessage = pipe(
    createTransactionMessage({version: 0}),
    (tx) => setTransactionMessageFeePayer(account, tx),
    (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: (decompiledTransactionMessage.lifetimeConstraint as any)
            .blockhash,
          lastValidBlockHeight: BigInt(
            swapTransactionResponse.lastValidBlockHeight
          ),
        },
        tx
      ),
    (tx) =>
      appendTransactionMessageInstruction(
        getCreateAssociatedTokenIdempotentInstruction({
          ata: ataAddress,
          mint: SOLANA_USDC_MINT_ADDRESS,
          owner: recipient as Address,
          payer: account,
        }),
        tx
      ),
    (tx) =>
      appendTransactionMessageInstructions(
        decompiledTransactionMessage.instructions,
        tx
      )
  );
  const finalTransaction = compileTransaction(transactionMessage);

  response.json({
    transaction: getBase64EncodedWireTransaction(finalTransaction),
    message: "Thank you for using Sphere Pay!",
  });
};
