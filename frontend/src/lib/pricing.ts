export async function getSolPriceUsd(): Promise<number> {
  try {
    const response = await fetch('https://price.jup.ag/v4/price?ids=SOL');
    const data = await response.json();
    return data?.data?.SOL?.price ?? 0;
  } catch (error) {
    console.error('Failed to fetch SOL price:', error);
    return 0;
  }
}

