import { ethers } from 'ethers';
import { 
  ADDRESS_PROVIDER_ADDRESS, 
  PROVIDER_ABI, 
  POOL_ABI, 
  USDC_ASSET_ADDRESS 
} from './constants';

export const startYieldListener = (onUpdate: (apy: string) => void) => {
  const wssUrl = process.env.NEXT_PUBLIC_ALCHEMY_WSS_URL;
  if (!wssUrl) return () => {};

  const provider = new ethers.WebSocketProvider(wssUrl);

  const init = async () => {
    try {
      // 1. Connect to the Registry (Addresses Provider)
      const addressProvider = new ethers.Contract(
        ADDRESS_PROVIDER_ADDRESS,
        PROVIDER_ABI,
        provider
      );

      // 2. Ask the Registry for the current Pool Address
      const poolAddress = await addressProvider.getPool();
      console.log("Dynamically resolved Pool Address:", poolAddress);

      // 3. Connect to the Actual Pool
      const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);

      // 4. Fetch Initial Data
      const usdcAddress = USDC_ASSET_ADDRESS.toLowerCase();
      const data = await poolContract.getReserveData(usdcAddress);
      
      const liquidityRate = data[2]; 
      const currentApy = (Number(liquidityRate) / 1e25).toFixed(2);
      onUpdate(currentApy);

      // 5. Setup Real-time Listener on the resolved contract
      poolContract.on("ReserveDataUpdated", (reserve, liquidityRate) => {
        if (reserve.toLowerCase() === usdcAddress) {
          const apy = (Number(liquidityRate) / 1e25).toFixed(2);
          onUpdate(apy);
        }
      });

    } catch (err) {
      console.error("Critical: Failed to resolve Aave Pool.", err);
      onUpdate("ERR");
    }
  };

  init();

  return () => provider.destroy();
};