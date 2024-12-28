# Jupiter Swap Solana Pay Example

This API server generates QR codes compatible with Solana Pay. When scanned with a supported wallet, these QR codes initiate a Jupiter swap transaction that:
1. Converts a source token to a specified amount of USDC
2. Sends the USDC to a designated recipient address

## Example

https://qr-lsltacmgzq-uc.a.run.app/?inputMint=So11111111111111111111111111111111111111112&uiAmount=1&recipient=B1xRKC93k3eNV6Q4Q3NDiLYfPRsMnpBgjeoEwbbz2iCf

The above link renders a QR code that, when scanned with a Solana Pay compatible wallet, will:
1. Swap 1 SOL to USDC
2. Send the resulting USDC to `B1xRKC93k3eNV6Q4Q3NDiLYfPRsMnpBgjeoEwbbz2iCf`
