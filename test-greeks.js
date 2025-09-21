const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

fetch('https://api.polygon.io/v3/snapshot/options/SPY?limit=5&apikey=' + apiKey)
  .then(r => r.json())
  .then(d => {
    console.log('CHECKING FOR IV IN GREEKS:');
    d.results?.slice(0,3).forEach((opt, i) => {
      console.log(`Option ${i+1}:`);
      console.log('Greeks:', opt.greeks);
      console.log('Strike:', opt.details?.strike_price);
      console.log('Expiration:', opt.details?.expiration_date);
      console.log('---');
    });
  })
  .catch(e => console.error('ERROR:', e.message));