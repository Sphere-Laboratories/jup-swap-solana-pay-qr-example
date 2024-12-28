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

const CONSTANTS = {
  SOLANA_USDC_MINT_ADDRESS:
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address,
  SOLANA_USDC_MINT_DECIMALS: 6, // USDC has a precision of 6 decimal places
  RPC_URL: "https://susan-gdzl57-fast-mainnet.helius-rpc.com",
} as const;

// Create RPC client instance
const rpc = createSolanaRpc(CONSTANTS.RPC_URL);

// Jupiter API swap transaction response
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

// GET endpoint handler - Returns metadata for Solana Pay QR code
export const handleGet = async (response: Response) => {
  response.status(200).send({
    label: "Solana Pay QR Jupiter Swap demo",
    icon: "https://spherepay.co/assets/sphere-icon.svg",
  });
};

// POST endpoint handler - Builds the swap transaction
// Query params:
// - uiAmount: Amount of USDC to be sent
// - inputMint: Source token mint address
// - recipient: Destination wallet address
// Body:
// - account: User's wallet address (auto populated by the wallet app)
export const handlePost = async (request: Request, response: Response) => {
  const {uiAmount, inputMint, recipient} = request.query;
  const {account} = request.body;

  try {
    const quoteResponse = await getJupiterQuote(
      inputMint as string,
      uiAmount as string
    );
    const recipientAtaAddress = await getAssociatedTokenAddress(
      recipient as Address
    );

    const swapTransactionResponse = await getJupiterSwapTransaction(
      quoteResponse,
      account,
      recipientAtaAddress
    );

    const finalTransaction = await buildFinalTransaction({
      swapTransactionBase64: swapTransactionResponse.swapTransaction,
      account,
      recipient: recipient as Address,
      ataAddress: recipientAtaAddress,
      lastValidBlockHeight: swapTransactionResponse.lastValidBlockHeight,
    });

    response.json({
      transaction: getBase64EncodedWireTransaction(finalTransaction),
      message: "Thank you for using Sphere Pay!",
    });
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Parameters for building the final transaction
interface BuildFinalTransactionParams {
  swapTransactionBase64: string; // Jupiter's swap transaction
  account: Address; // User's wallet address
  recipient: Address; // Destination wallet address
  ataAddress: Address; // Associated Token Account address
  lastValidBlockHeight: number; // Transaction validity period
}

// Derives the USDC Associated Token Account (ATA) address for the recipient
async function getAssociatedTokenAddress(recipient: Address) {
  const [ataAddress] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      getAddressEncoder().encode(recipient),
      getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS),
      getAddressEncoder().encode(CONSTANTS.SOLANA_USDC_MINT_ADDRESS),
    ],
  });
  return ataAddress;
}

// Fetches a quote from Jupiter for the swap
// Parameters:
// - inputMint: Source token mint address
// - uiAmount: Amount to swap in UI units (will be converted to raw units)
async function getJupiterQuote(inputMint: string, uiAmount: string) {
  const response = await axios.get("https://quote-api.jup.ag/v6/quote", {
    params: {
      inputMint,
      outputMint: CONSTANTS.SOLANA_USDC_MINT_ADDRESS,
      // eslint-disable-next-line new-cap
      amount: Big(uiAmount)
        .times(10 ** CONSTANTS.SOLANA_USDC_MINT_DECIMALS)
        .round(0, 0)
        .toFixed(),
      swapMode: "ExactOut",
      restrictIntermediateTokens: true,
    },
  });
  return response.data;
}

// Gets the swap transaction from Jupiter using the quote
// Parameters:
// - quoteResponse: Jupiter quote response
// - account: User's wallet address
// - ataAddress: Destination ATA address
async function getJupiterSwapTransaction(
  quoteResponse: any,
  account: Address,
  ataAddress: Address
) {
  const response = await axios.post<SwapTransactionResponse>(
    "https://quote-api.jup.ag/v6/swap",
    {
      quoteResponse,
      userPublicKey: account,
      useSharedAccounts: true,
      destinationTokenAccount: ataAddress,
    }
  );
  return response.data;
}

// Builds the final transaction by:
// 1. Decoding Jupiter's swap transaction
// 2. Creating a new transaction with ATA creation instruction
// 3. Adding the swap instructions
async function buildFinalTransaction({
  swapTransactionBase64,
  account,
  recipient,
  ataAddress,
  lastValidBlockHeight,
}: BuildFinalTransactionParams) {
  const swapTransactionBuffer = Buffer.from(swapTransactionBase64, "base64");
  const decodedTransaction = getTransactionDecoder().decode(
    swapTransactionBuffer
  );
  const compiledTransactionMessage =
    getCompiledTransactionMessageDecoder().decode(
      decodedTransaction.messageBytes
    );
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
          lastValidBlockHeight: BigInt(lastValidBlockHeight),
        },
        tx
      ),
    (tx) =>
      appendTransactionMessageInstruction(
        getCreateAssociatedTokenIdempotentInstruction({
          ata: ataAddress,
          mint: CONSTANTS.SOLANA_USDC_MINT_ADDRESS,
          owner: recipient,
          payer: account as any,
        }),
        tx
      ),
    (tx) =>
      appendTransactionMessageInstructions(
        decompiledTransactionMessage.instructions,
        tx
      )
  );

  return compileTransaction(transactionMessage);
}
