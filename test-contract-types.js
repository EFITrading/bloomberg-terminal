// Test the contract type processing logic

const contracts = [
  { contract_type: 'call', strike_price: 250, expiration_date: '2025-10-17' },
  { contract_type: 'put', strike_price: 250, expiration_date: '2025-10-17' }
];

contracts.forEach(contract => {
  let optionType = contract.contract_type?.toLowerCase();
  console.log(`Contract type: "${contract.contract_type}" -> processed: "${optionType}"`);
  
  const key = `${contract.strike_price}-${contract.expiration_date}-${optionType}`;
  console.log(`Generated key: "${key}"`);
});