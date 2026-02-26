import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY

// Filtered symbols — 1,253 tickers with market cap >= $5B (generated 2026-02-26)
const TOP_SCREENER_SYMBOLS = [
  'A',
  'AA',
  'AAL',
  'AAON',
  'AAPL',
  'ABBV',
  'ABCB',
  'ABEV',
  'ABNB',
  'ABT',
  'ABVX',
  'ACA',
  'ACGL',
  'ACHR',
  'ACI',
  'ACLX',
  'ACM',
  'ACN',
  'ACT',
  'ADBE',
  'ADC',
  'ADI',
  'ADM',
  'ADP',
  'ADSK',
  'ADT',
  'AEE',
  'AEG',
  'AEIS',
  'AEM',
  'AEP',
  'AER',
  'AES',
  'AFG',
  'AFL',
  'AFRM',
  'AG',
  'AGCO',
  'AGI',
  'AGNC',
  'AGX',
  'AHR',
  'AIG',
  'AIT',
  'AIZ',
  'AJG',
  'AKAM',
  'AL',
  'ALAB',
  'ALB',
  'ALC',
  'ALGM',
  'ALGN',
  'ALK',
  'ALL',
  'ALLE',
  'ALLY',
  'ALKS',
  'ALSN',
  'ALNY',
  'ALV',
  'AM',
  'AMAT',
  'AMCR',
  'AMD',
  'AME',
  'AMG',
  'AMGN',
  'AMH',
  'AMKR',
  'AMP',
  'AMRZ',
  'AMT',
  'AMTM',
  'AMZN',
  'AMX',
  'AN',
  'ANET',
  'AON',
  'AOS',
  'APA',
  'APD',
  'APG',
  'APH',
  'APLD',
  'APO',
  'APP',
  'APPF',
  'APTV',
  'AQN',
  'AR',
  'ARCC',
  'ARE',
  'ARES',
  'ARGX',
  'ARM',
  'ARMK',
  'AROC',
  'ARWR',
  'ARW',
  'AS',
  'ASML',
  'ASND',
  'ASR',
  'ASTS',
  'ASX',
  'ATAT',
  'ATI',
  'ATMU',
  'ATO',
  'ATR',
  'AU',
  'AUB',
  'AUGO',
  'AUR',
  'AVAL',
  'AVAV',
  'AVB',
  'AVGO',
  'AVT',
  'AVTR',
  'AVY',
  'AWI',
  'AWK',
  'AX',
  'AXON',
  'AXP',
  'AXSM',
  'AXS',
  'AXTA',
  'AYI',
  'AZN',
  'AZO',
  'B',
  'BA',
  'BABA',
  'BAC',
  'BAH',
  'BALL',
  'BAM',
  'BAP',
  'BAX',
  'BBD',
  'BBDO',
  'BBIO',
  'BBVA',
  'BBY',
  'BC',
  'BCE',
  'BCH',
  'BCO',
  'BCPC',
  'BCS',
  'BDC',
  'BDX',
  'BE',
  'BEKE',
  'BEN',
  'BEP',
  'BEPC',
  'BG',
  'BHP',
  'BIDU',
  'BIIB',
  'BILI',
  'BIO',
  'BIP',
  'BIPC',
  'BIRK',
  'BJ',
  'BK',
  'BKH',
  'BKNG',
  'BKR',
  'BLCO',
  'BLD',
  'BLDR',
  'BLK',
  'BLTE',
  'BMA',
  'BMO',
  'BMRN',
  'BMNR',
  'BMY',
  'BN',
  'BNS',
  'BNT',
  'BNTX',
  'BOKF',
  'BOOT',
  'BP',
  'BPOP',
  'BR',
  'BRK.A',
  'BRK.B',
  'BRKR',
  'BRO',
  'BROS',
  'BRX',
  'BSAC',
  'BSBR',
  'BSX',
  'BSY',
  'BTI',
  'BTSG',
  'BTG',
  'BUD',
  'BURL',
  'BVN',
  'BWA',
  'BWXT',
  'BX',
  'BXP',
  'BYD',
  'BZ',
  'C',
  'CACI',
  'CACC',
  'CAE',
  'CAG',
  'CAH',
  'CAI',
  'CAMT',
  'CARR',
  'CART',
  'CASY',
  'CAT',
  'CAVA',
  'CB',
  'CBRE',
  'CBSH',
  'CCEP',
  'CCI',
  'CCJ',
  'CCK',
  'CCL',
  'CDE',
  'CDNS',
  'CDW',
  'CE',
  'CEG',
  'CELH',
  'CF',
  'CFG',
  'CFR',
  'CG',
  'CGNX',
  'CHD',
  'CHDN',
  'CHE',
  'CHH',
  'CHKP',
  'CHRD',
  'CHRW',
  'CHT',
  'CHTR',
  'CHWY',
  'CHYM',
  'CI',
  'CIB',
  'CIEN',
  'CIFR',
  'CIG',
  'CIGI',
  'CINF',
  'CL',
  'CLF',
  'CLH',
  'CLS',
  'CLX',
  'CM',
  'CMC',
  'CMCSA',
  'CME',
  'CMG',
  'CMI',
  'CMS',
  'CNA',
  'CNC',
  'CNH',
  'CNI',
  'CNM',
  'CNP',
  'CNQ',
  'CNX',
  'COF',
  'COGT',
  'COHR',
  'COIN',
  'COKE',
  'COLB',
  'COMP',
  'COO',
  'COP',
  'COR',
  'CORZ',
  'COST',
  'CP',
  'CPA',
  'CPAY',
  'CPB',
  'CPNG',
  'CPRT',
  'CPT',
  'CQP',
  'CR',
  'CRBG',
  'CRC',
  'CRCL',
  'CRDO',
  'CRH',
  'CRK',
  'CRL',
  'CRM',
  'CRS',
  'CRSP',
  'CRUS',
  'CRWD',
  'CRWV',
  'CSAN',
  'CSCO',
  'CSGP',
  'CSL',
  'CSX',
  'CTAS',
  'CTSH',
  'CTRA',
  'CTRE',
  'CTVA',
  'CUBE',
  'CUK',
  'CVE',
  'CVNA',
  'CVS',
  'CVX',
  'CW',
  'CWAN',
  'CWST',
  'CX',
  'CYTK',
  'D',
  'DAL',
  'DAR',
  'DASH',
  'DB',
  'DBX',
  'DCI',
  'DD',
  'DDOG',
  'DDS',
  'DE',
  'DECK',
  'DELL',
  'DEO',
  'DG',
  'DGX',
  'DHI',
  'DHR',
  'DINO',
  'DIS',
  'DKNG',
  'DKS',
  'DLB',
  'DLR',
  'DLTR',
  'DOC',
  'DOCN',
  'DOCU',
  'DOV',
  'DOW',
  'DOX',
  'DPZ',
  'DRI',
  'DRS',
  'DSGX',
  'DT',
  'DTE',
  'DTM',
  'DUK',
  'DUOL',
  'DVA',
  'DVN',
  'DXCM',
  'DY',
  'E',
  'EA',
  'EAT',
  'EBAY',
  'EC',
  'ECG',
  'ECL',
  'ED',
  'EDU',
  'EFX',
  'EG',
  'EGO',
  'EGP',
  'EHC',
  'EIX',
  'EL',
  'ELAN',
  'ELF',
  'ELPC',
  'ELS',
  'ELV',
  'EMA',
  'EME',
  'EMN',
  'EMR',
  'ENB',
  'ENIC',
  'ENLT',
  'ENPH',
  'ENS',
  'ENSG',
  'ENTG',
  'EOG',
  'EPAM',
  'EPD',
  'EPRT',
  'EQH',
  'EQIX',
  'EQNR',
  'EQR',
  'EQT',
  'EQX',
  'ERIC',
  'ERIE',
  'ES',
  'ESAB',
  'ESE',
  'ESI',
  'ESLT',
  'ESNT',
  'ESS',
  'ESTC',
  'ET',
  'ETN',
  'ETR',
  'ETSY',
  'EVR',
  'EVRG',
  'EW',
  'EWBC',
  'EXAS',
  'EXC',
  'EXE',
  'EXEL',
  'EXP',
  'EXPD',
  'EXPE',
  'EXR',
  'F',
  'FAF',
  'FANG',
  'FAST',
  'FBIN',
  'FCFS',
  'FCNCA',
  'FCX',
  'FDX',
  'FE',
  'FER',
  'FERG',
  'FFIV',
  'FHN',
  'FICO',
  'FIG',
  'FIGR',
  'FIS',
  'FITB',
  'FIVE',
  'FIX',
  'FLEX',
  'FLG',
  'FLR',
  'FLS',
  'FLUT',
  'FMS',
  'FMX',
  'FN',
  'FNB',
  'FND',
  'FNF',
  'FNV',
  'FORM',
  'FOX',
  'FOXA',
  'FR',
  'FRHC',
  'FRMI',
  'FRO',
  'FRT',
  'FSLR',
  'FSS',
  'FSV',
  'FTAI',
  'FTI',
  'FTNT',
  'FTS',
  'FTV',
  'FUTU',
  'FWONA',
  'FWONK',
  'G',
  'GAP',
  'GATX',
  'GBCI',
  'GD',
  'GDDY',
  'GDS',
  'GE',
  'GEHC',
  'GEN',
  'GEV',
  'GFI',
  'GFL',
  'GFS',
  'GGAL',
  'GGB',
  'GGG',
  'GH',
  'GIB',
  'GILD',
  'GIL',
  'GIS',
  'GKOS',
  'GL',
  'GLBE',
  'GLPI',
  'GLW',
  'GM',
  'GMAB',
  'GME',
  'GMED',
  'GNRC',
  'GNTX',
  'GOLF',
  'GOOG',
  'GOOGL',
  'GPC',
  'GPN',
  'GRAB',
  'GRFS',
  'GRMN',
  'GS',
  'GSAT',
  'GSK',
  'GTLS',
  'GVA',
  'GWRE',
  'GWW',
  'GXO',
  'H',
  'HAL',
  'HALO',
  'HAS',
  'HBAN',
  'HBM',
  'HCA',
  'HD',
  'HDB',
  'HEI',
  'HIG',
  'HII',
  'HL',
  'HLI',
  'HLN',
  'HLT',
  'HMC',
  'HMY',
  'HOLX',
  'HOMB',
  'HON',
  'HOOD',
  'HPE',
  'HPQ',
  'HQY',
  'HR',
  'HRL',
  'HSBC',
  'HSIC',
  'HST',
  'HSY',
  'HTHT',
  'HUBB',
  'HUBS',
  'HUM',
  'HUT',
  'HWC',
  'HWM',
  'HXL',
  'IAG',
  'IBM',
  'IBKR',
  'IBN',
  'IBRX',
  'IBP',
  'ICE',
  'ICLR',
  'ICL',
  'IDA',
  'IDCC',
  'IDXX',
  'IESC',
  'IEX',
  'IFF',
  'IFS',
  'IHG',
  'ILMN',
  'IMVT',
  'INCY',
  'INFY',
  'ING',
  'INGR',
  'INSM',
  'INTC',
  'INTU',
  'INVH',
  'IONQ',
  'IONS',
  'IOT',
  'IP',
  'IPGP',
  'IQV',
  'IR',
  'IREN',
  'IRM',
  'ISRG',
  'IT',
  'ITT',
  'ITUB',
  'ITW',
  'IVZ',
  'IX',
  'J',
  'JAZZ',
  'JBL',
  'JBHT',
  'JBS',
  'JBTM',
  'JCI',
  'JD',
  'JEF',
  'JHG',
  'JHX',
  'JKHY',
  'JLL',
  'JNJ',
  'JOBY',
  'JPM',
  'JXN',
  'KB',
  'KBR',
  'KDP',
  'KEP',
  'KEX',
  'KEY',
  'KEYS',
  'KGC',
  'KHC',
  'KIM',
  'KKR',
  'KLAC',
  'KLAR',
  'KMB',
  'KMI',
  'KMX',
  'KNF',
  'KNSL',
  'KNX',
  'KO',
  'KOF',
  'KR',
  'KRG',
  'KRMN',
  'KRYS',
  'KSPI',
  'KT',
  'KTOS',
  'KVUE',
  'KVYO',
  'KYMR',
  'L',
  'LAD',
  'LAMR',
  'LBRDA',
  'LBRDK',
  'LDOS',
  'LEA',
  'LECO',
  'LEN',
  'LEVI',
  'LFUS',
  'LH',
  'LHX',
  'LI',
  'LII',
  'LIN',
  'LINE',
  'LITE',
  'LKQ',
  'LLYVA',
  'LLYVK',
  'LLY',
  'LMT',
  'LNC',
  'LNG',
  'LNT',
  'LOAR',
  'LOGI',
  'LOW',
  'LPLA',
  'LPL',
  'LPX',
  'LRCX',
  'LSCC',
  'LTH',
  'LTM',
  'LULU',
  'LUMN',
  'LUV',
  'LVS',
  'LW',
  'LYB',
  'LYFT',
  'LYG',
  'LYV',
  'M',
  'MA',
  'MAA',
  'MAC',
  'MAIN',
  'MANH',
  'MAR',
  'MAS',
  'MASI',
  'MAT',
  'MATX',
  'MBLY',
  'MCHP',
  'MCD',
  'MCK',
  'MCO',
  'MDB',
  'MDGL',
  'MDLZ',
  'MDT',
  'MEDP',
  'MELI',
  'META',
  'MET',
  'MFC',
  'MFG',
  'MGA',
  'MGM',
  'MHK',
  'MIDD',
  'MIR',
  'MIRM',
  'MKC',
  'MKL',
  'MKSI',
  'MKTX',
  'MLI',
  'MLM',
  'MMM',
  'MMYT',
  'MNSO',
  'MNST',
  'MO',
  'MOD',
  'MOH',
  'MORN',
  'MOS',
  'MP',
  'MPC',
  'MPLX',
  'MPWR',
  'MRCY',
  'MRK',
  'MRNA',
  'MRP',
  'MRVL',
  'MS',
  'MSA',
  'MSCI',
  'MSFT',
  'MSGS',
  'MSI',
  'MSM',
  'MSTR',
  'MT',
  'MTB',
  'MTCH',
  'MTD',
  'MTDR',
  'MTG',
  'MTH',
  'MTN',
  'MTSI',
  'MTZ',
  'MU',
  'MUFG',
  'MUSA',
  'NBIS',
  'NBIX',
  'NCLH',
  'NDAQ',
  'NDSN',
  'NE',
  'NEE',
  'NEM',
  'NET',
  'NEU',
  'NG',
  'NFLX',
  'NFG',
  'NGG',
  'NGD',
  'NI',
  'NICE',
  'NIO',
  'NJR',
  'NKE',
  'NLY',
  'NMR',
  'NNN',
  'NOC',
  'NOK',
  'NOV',
  'NOW',
  'NPO',
  'NRG',
  'NSC',
  'NTAP',
  'NTES',
  'NTNX',
  'NTRA',
  'NTR',
  'NTRS',
  'NU',
  'NUE',
  'NUVL',
  'NVDA',
  'NVMI',
  'NVO',
  'NVR',
  'NVS',
  'NVT',
  'NWG',
  'NWS',
  'NWSA',
  'NXE',
  'NXPI',
  'NXST',
  'NXT',
  'NYT',
  'O',
  'OBDC',
  'OC',
  'ODFL',
  'OGE',
  'OGS',
  'OHI',
  'OKE',
  'OKLO',
  'OKTA',
  'OLED',
  'OLLI',
  'OMAB',
  'OMC',
  'OMF',
  'ON',
  'ONB',
  'ONC',
  'ONON',
  'ONTO',
  'OPCH',
  'OR',
  'ORA',
  'ORCL',
  'ORI',
  'ORLA',
  'ORLY',
  'OSK',
  'OTEX',
  'OTF',
  'OTIS',
  'OVV',
  'OWL',
  'OXY',
  'OZK',
  'PAA',
  'PAAS',
  'PAC',
  'PAG',
  'PANW',
  'PATH',
  'PAYC',
  'PAYX',
  'PB',
  'PBA',
  'PBR',
  'PCAR',
  'PCG',
  'PCOR',
  'PCTY',
  'PCVX',
  'PDD',
  'PDI',
  'PEG',
  'PEGA',
  'PEN',
  'PEP',
  'PFE',
  'PFG',
  'PFGC',
  'PG',
  'PGR',
  'PH',
  'PHG',
  'PHI',
  'PHM',
  'PINS',
  'PIPR',
  'PKG',
  'PKX',
  'PL',
  'PLD',
  'PLNT',
  'PLTR',
  'PLXS',
  'PM',
  'PNC',
  'PNFP',
  'PNR',
  'PNW',
  'PODD',
  'PONY',
  'POOL',
  'POR',
  'POST',
  'POWL',
  'PPC',
  'PPG',
  'PPL',
  'PR',
  'PRAX',
  'PRI',
  'PRIM',
  'PRMB',
  'PRU',
  'PSA',
  'PSKY',
  'PSN',
  'PSO',
  'PSTG',
  'PSX',
  'PTC',
  'PTCT',
  'PTGX',
  'PUK',
  'PWR',
  'PYPL',
  'QBTS',
  'QCOM',
  'QGEN',
  'QRVO',
  'QSR',
  'QXO',
  'R',
  'RACE',
  'RAL',
  'RBA',
  'RBC',
  'RBLX',
  'RBRK',
  'RCI',
  'RCL',
  'RDDT',
  'RDNT',
  'RDY',
  'REG',
  'REGN',
  'RELX',
  'REXR',
  'REYN',
  'REZI',
  'RF',
  'RGA',
  'RGC',
  'RGEN',
  'RGLD',
  'RGTI',
  'RIOT',
  'RIVN',
  'RKLB',
  'RMBS',
  'RNA',
  'ROAD',
  'ROIV',
  'ROKU',
  'ROP',
  'ROST',
  'RPRX',
  'RUSHA',
  'RUSHB',
  'RVMD',
  'RYAAY',
  'RYTM',
  'SAIA',
  'SAIL',
  'SANM',
  'SATS',
  'SBAC',
  'SBRA',
  'SBUX',
  'SEIC',
  'SFD',
  'SFM',
  'SHOP',
  'SIRI',
  'SITM',
  'SLAB',
  'SMCI',
  'SMMT',
  'SMTC',
  'SNDK',
  'SNEX',
  'SNPS',
  'SNY',
  'SOFI',
  'SRAD',
  'SSNC',
  'SSRM',
  'STLD',
  'STRL',
  'STX',
  'SWKS',
  'SYM',
  'TCOM',
  'TEAM',
  'TECH',
  'TEM',
  'TER',
  'TIGO',
  'TLN',
  'TMUS',
  'TPG',
  'TRI',
  'TRMB',
  'TROW',
  'TSCO',
  'TSEM',
  'TSLA',
  'TTAN',
  'TTD',
  'TTEK',
  'TTMI',
  'TTWO',
  'TW',
  'TXN',
  'TXRH',
  'UAL',
  'UBSI',
  'UEC',
  'UFPI',
  'ULTA',
  'UMBF',
  'URBN',
  'UTHR',
  'UUUU',
  'VFS',
  'VIAV',
  'VICR',
  'VLY',
  'VNOM',
  'VOD',
  'VRSK',
  'VRSN',
  'VRTX',
  'VSAT',
  'VSEC',
  'VTRS',
  'WBD',
  'WDAY',
  'WDC',
  'WFRD',
  'WING',
  'WMG',
  'WTFC',
  'WTW',
  'WULF',
  'WWD',
  'WYNN',
  'XEL',
  'XP',
  'Z',
  'ZBRA',
  'ZG',
  'ZION',
  'ZM',
  'ZS',
]

interface GEXData {
  ticker: string
  attractionLevel: number
  dealerSweat: number
  currentPrice: number
  netGex: number
  marketCap?: number
  gexImpactScore?: number
  vex?: number
  dex?: number
  si?: number
  // Wall data for Support/Resistance
  largestWall?: {
    strike: number
    gex: number
    type: 'call' | 'put'
    pressure: number // 1-100 based on distance to wall
    cluster?: {
      strikes: number[]
      centralStrike: number
      totalGEX: number
      contributions: number[] // Percentage contributions (0-100)
      oi: number[] // Real open interest per strike
      type: 'call' | 'put'
    }
  }
}

// Get market cap data from Polygon
async function getMarketCap(symbol: string): Promise<number> {
  try {
    const response = await fetch(
      `https://api.polygon.io/v3/reference/tickers/${symbol}?apikey=${POLYGON_API_KEY}`,
      { next: { revalidate: 86400 } } // Cache for 24 hours (market cap changes slowly)
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch market cap for ${symbol}`)
    }

    const data = await response.json()
    const marketCap = data.results?.market_cap

    return marketCap || 0
  } catch (error) {
    console.error(`Error fetching market cap for ${symbol}:`, error)
    return 0
  }
}

// Calculate GEX Impact Score: how much the GEX can move the stock relative to market cap
function calculateGEXImpactScore(gexValue: number, marketCap: number): number {
  if (marketCap === 0) return 0

  // Convert GEX from billions to actual value, and market cap is already in dollars
  const gexDollars = Math.abs(gexValue) * 1e9

  // Calculate GEX as percentage of market cap
  const gexToMarketCapRatio = gexDollars / marketCap

  let impactScore: number

  // Different scaling for different market cap tiers
  if (marketCap >= 1e12) {
    // $1T+ mega-caps (NVDA, AAPL, MSFT, etc.)
    // Realistic scaling based on actual GEX levels: 0.5% = 100 points, 0.25% = 50 points
    impactScore = Math.min(100, gexToMarketCapRatio * 20000)
  } else if (marketCap >= 500e9) {
    // $500B-$1T large caps
    // Medium scaling: 1.5% = 100 points, 0.75% = 50 points
    impactScore = Math.min(100, gexToMarketCapRatio * 6667)
  } else if (marketCap >= 100e9) {
    // $100B-$500B mid-large caps
    // Standard scaling: 1% = 100 points, 0.5% = 50 points
    impactScore = Math.min(100, gexToMarketCapRatio * 10000)
  } else {
    // <$100B smaller caps
    // More sensitive scaling: 0.5% = 100 points, 0.25% = 50 points
    impactScore = Math.min(100, gexToMarketCapRatio * 20000)
  }

  return Math.round(impactScore)
}

const POLYGON_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'

// Fetch options data directly from Polygon — no internal HTTP hop.
// Uses date-range filter on the snapshot endpoint: 2 parallel calls instead of 10+.
async function getOptionsDataDirect(
  symbol: string,
  expirationFilter: string,
  timeoutMs: number = 18000
): Promise<{
  currentPrice: number
  data: Record<string, { calls: Record<string, any>; puts: Record<string, any> }>
} | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    // Build expiration date range from the filter
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    const todayStr = fmt(today)

    let maxDays = 45
    if (expirationFilter === 'Week') maxDays = 7
    else if (expirationFilter === 'Month') maxDays = 30
    else if (expirationFilter === 'Quad') maxDays = 100 // wide enough to capture next quarterly

    const maxDate = new Date(today.getTime() + maxDays * 86400000)
    const maxDateStr = fmt(maxDate)

    // Parallel: price + options snapshot with date range
    const priceUrl = `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_KEY}`
    const snapUrl = `https://api.polygon.io/v3/snapshot/options/${symbol}?expiration_date.gte=${todayStr}&expiration_date.lte=${maxDateStr}&limit=250&apikey=${POLYGON_KEY}`

    // Fetch with retry on 429 (Polygon rate limit)
    const fetchWithRetry = async (
      url: string,
      signal: AbortSignal,
      retries = 2
    ): Promise<Response | null> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(url, { signal })
        if (res.status === 429) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
            continue
          }
          console.warn(`⚠️ ${symbol}: Polygon rate limit (429) after ${retries + 1} attempts`)
          return null
        }
        if (!res.ok) {
          console.warn(`⚠️ ${symbol}: Polygon HTTP ${res.status}`)
          return null
        }
        return res
      }
      return null
    }

    const [priceRes, snapRes] = await Promise.all([
      fetchWithRetry(priceUrl, controller.signal),
      fetchWithRetry(snapUrl, controller.signal),
    ])

    clearTimeout(timeout)

    if (!priceRes || !snapRes) return null

    const [priceData, snapData] = await Promise.all([priceRes.json(), snapRes.json()])

    const currentPrice: number = priceData?.results?.p || priceData?.results?.P || 0
    if (!currentPrice) return null

    if (snapData.status !== 'OK' || !snapData.results?.length) return null

    // Collect all pages (Polygon paginates at 250)
    const allContracts: any[] = [...snapData.results]
    let nextUrl: string | null = snapData.next_url
      ? `${snapData.next_url}&apikey=${POLYGON_KEY}`
      : null

    // Fetch remaining pages (usually 0–2 extra pages for most symbols)
    while (nextUrl) {
      const pageCtrl = new AbortController()
      const pageTimeout = setTimeout(() => pageCtrl.abort(), 5000)
      try {
        const pageRes = await fetch(nextUrl, { signal: pageCtrl.signal })
        clearTimeout(pageTimeout)
        if (!pageRes.ok) break
        const pageData = await pageRes.json()
        if (pageData.results?.length) allContracts.push(...pageData.results)
        nextUrl = pageData.next_url ? `${pageData.next_url}&apikey=${POLYGON_KEY}` : null
      } catch {
        clearTimeout(pageTimeout)
        break
      }
    }

    // Group contracts into the same shape the rest of the code expects:
    // { [expDate]: { calls: { [strike]: contractData }, puts: { [strike]: contractData } } }
    const grouped: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = {}

    for (const c of allContracts) {
      const exp: string = c.details?.expiration_date
      const strike: string = c.details?.strike_price?.toString()
      const type: string = c.details?.contract_type?.toLowerCase()
      if (!exp || !strike || (type !== 'call' && type !== 'put')) continue

      if (!grouped[exp]) grouped[exp] = { calls: {}, puts: {} }

      const cd = {
        open_interest: c.open_interest || 0,
        strike_price: c.details.strike_price,
        expiration_date: exp,
        greeks: {
          delta: c.greeks?.delta,
          gamma: c.greeks?.gamma,
          theta: c.greeks?.theta,
          vega: c.greeks?.vega,
        },
      }

      if (type === 'call') grouped[exp].calls[strike] = cd
      else grouped[exp].puts[strike] = cd
    }

    if (!Object.keys(grouped).length) return null

    return { currentPrice, data: grouped }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // silent timeout
    }
    return null
  }
}

// Helper function to classify and filter expiration dates based on actual available data
function filterExpirationsByType(expirationDates: string[], filter: string): string[] {
  const today = new Date()

  // Parse and sort expiration dates
  const validDates = expirationDates
    .map((dateStr) => ({ dateStr, date: new Date(dateStr) }))
    .filter((item) => item.date >= today) // Only future expirations
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (validDates.length === 0) {
    return []
  }

  switch (filter) {
    case 'Week':
      // Weekly options: Find ONLY the next weekly expiry (usually the closest Friday)
      const nextWeekly = validDates[0]

      return [nextWeekly.dateStr]

    case 'Month':
      // Monthly options: Find the monthly expiry (3rd Friday pattern) and include all weeklies up to it
      const monthlyExpiry = validDates.find((item) => {
        const dayOfMonth = item.date.getDate()
        const dayOfWeek = item.date.getDay()
        // Monthly expiry is typically 3rd Friday (day 15-21, Friday = 5)
        return dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21
      })

      if (monthlyExpiry) {
        const monthlyExpirations = validDates.filter((item) => item.date <= monthlyExpiry.date)
        return monthlyExpirations.map((d) => d.dateStr)
      } else {
        const monthOut = new Date(today.getTime() + 35 * 24 * 60 * 60 * 1000)
        const fallbackMonthly = validDates.filter((item) => item.date <= monthOut)
        return fallbackMonthly.map((d) => d.dateStr)
      }

    case 'Quad':
      // Quadruple witching: Find the next quarterly expiration and include all expirations up to it
      const quarterlyMonths = [2, 5, 8, 11] // Mar, Jun, Sep, Dec (0-indexed)

      const quarterlyExpiry = validDates.find((item) => {
        const month = item.date.getMonth()
        const dayOfMonth = item.date.getDate()
        const dayOfWeek = item.date.getDay()
        // Quarterly expiry: 3rd Friday of Mar/Jun/Sep/Dec
        return (
          quarterlyMonths.includes(month) && dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21
        )
      })

      if (quarterlyExpiry) {
        const quadExpirations = validDates.filter((item) => item.date <= quarterlyExpiry.date)
        return quadExpirations.map((d) => d.dateStr)
      }

      const quarterOut = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
      const fallbackQuarterly = validDates.filter((item) => item.date <= quarterOut)
      return fallbackQuarterly.map((d) => d.dateStr)

    default: {
      const fortyFiveDaysOut = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000)
      const defaultExpirations = validDates.filter((item) => item.date <= fortyFiveDaysOut)
      return defaultExpirations.map((d) => d.dateStr)
    }
  }
}

// Calculate GEX levels for a single symbol using the same logic as working GEX endpoint
async function calculateSymbolGEX(
  symbol: string,
  _baseUrl: string,
  expirationFilter: string = 'Default'
): Promise<GEXData | null> {
  try {
    const [optionsData, marketCap] = await Promise.all([
      getOptionsDataDirect(symbol, expirationFilter),
      getMarketCap(symbol),
    ])

    if (!optionsData || !optionsData.data) {
      return null
    }

    const currentPrice = optionsData.currentPrice

    // getOptionsDataDirect already filtered to the correct date range for the given expirationFilter.
    // For Quad we fetched up to 100 days — narrow down to expirations up to the nearest quarterly.
    let validExpirations: string[] = Object.keys(optionsData.data).sort()

    if (expirationFilter === 'Quad' && validExpirations.length > 0) {
      const quadMonths = [2, 5, 8, 11]
      const isThirdFriday = (d: Date) =>
        d.getUTCDay() === 5 && d.getUTCDate() >= 15 && d.getUTCDate() <= 21
      const nearestQuad = validExpirations.find((exp) => {
        const d = new Date(exp + 'T00:00:00Z')
        return quadMonths.includes(d.getUTCMonth()) && isThirdFriday(d)
      })
      if (nearestQuad) {
        validExpirations = validExpirations.filter((exp) => exp <= nearestQuad)
      }
    }

    if (validExpirations.length === 0) {
      return null
    }

    // Calculate GEX by strike
    const gexByStrikeByExp: {
      [strike: number]: { call: number; put: number; callOI: number; putOI: number }
    } = {}
    let totalNetGex = 0

    for (const expDate of validExpirations) {
      const { calls, puts } = optionsData.data[expDate]

      // Process calls - ACCUMULATE values for same strikes across expirations (EXACT COPY from SI screener lines 1453-1478)
      if (calls) {
        Object.entries(calls).forEach(([strike, data]: [string, any]) => {
          const strikeNum = parseFloat(strike)
          const oi = data.open_interest || 0

          if (oi > 0) {
            if (!gexByStrikeByExp[strikeNum]) {
              gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 }
            }

            gexByStrikeByExp[strikeNum].callOI += oi

            const gamma = data.greeks?.gamma || 0
            if (gamma) {
              const gex = gamma * oi * (currentPrice * currentPrice) * 100
              gexByStrikeByExp[strikeNum].call += gex
              totalNetGex += gex
            }
          }
        })
      }

      // Process puts - ACCUMULATE values for same strikes across expirations (EXACT COPY from SI screener lines 1480-1508)
      if (puts) {
        Object.entries(puts).forEach(([strike, data]: [string, any]) => {
          const strikeNum = parseFloat(strike)
          const oi = data.open_interest || 0

          if (oi > 0) {
            if (!gexByStrikeByExp[strikeNum]) {
              gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 }
            }

            gexByStrikeByExp[strikeNum].putOI += oi

            const gamma = data.greeks?.gamma || 0
            if (gamma) {
              const gex = -gamma * oi * (currentPrice * currentPrice) * 100
              gexByStrikeByExp[strikeNum].put += gex
              totalNetGex += gex
            }
          }
        })
      }
    }

    const netGexBillions = totalNetGex / 1e9

    // Find attraction level (strike with highest absolute net GEX)
    let maxAbsGex = 0
    let attractionLevel = currentPrice
    let dealerSweat = 0

    Object.entries(gexByStrikeByExp).forEach(([strike, data]) => {
      const strikeNum = parseFloat(strike)
      const netGex = data.call + data.put
      const absGex = Math.abs(netGex)

      if (absGex > maxAbsGex) {
        maxAbsGex = absGex
        attractionLevel = strikeNum
        dealerSweat = netGex / 1e9 // Convert to billions
      }
    })

    const gexImpactScore = calculateGEXImpactScore(dealerSweat, marketCap)

    // Find clustered GEX zones (2-4 strikes with highest combined GEX, no single strike >60%)
    const levels = Object.entries(gexByStrikeByExp)
      .map(([strike, data]) => ({
        strike: parseFloat(strike),
        call: data.call,
        put: data.put,
        callOI: data.callOI,
        putOI: data.putOI,
      }))
      .sort((a, b) => a.strike - b.strike) // Sort by strike price for adjacency

    // Function to find a GEX tower using NET GEX per strike (call + put combined).
    // gexSign: 'positive' → tower peak is net positive, 'negative' → tower peak is net negative.
    // Tower rule: exactly 3 consecutive strikes, center is the global peak for that sign,
    // both neighbors are 25-65% of the center's absolute value.
    function findBestGEXCluster(strikeData: any[], gexSign: 'call' | 'put') {
      // Compute net GEX per strike (signed)
      const netStrikes = strikeData.map((s) => ({
        ...s,
        net: s.call + s.put,
      }))

      // For 'call' (positive tower) keep only strikes where net > 0
      // For 'put' (negative tower) keep only strikes where net < 0
      const validStrikes = netStrikes.filter((s) => (gexSign === 'call' ? s.net > 0 : s.net < 0))

      if (validStrikes.length < 3) return null

      const absNet = (s: any) => Math.abs(s.net)

      // Global peak of absolute net GEX among valid-sign strikes
      const globalPeak = Math.max(...validStrikes.map(absNet))

      let bestCluster = null
      let bestCenterGEX = 0

      for (let i = 1; i < validStrikes.length - 1; i++) {
        const left = validStrikes[i - 1]
        const center = validStrikes[i]
        const right = validStrikes[i + 1]

        const leftAbs = absNet(left)
        const centerAbs = absNet(center)
        const rightAbs = absNet(right)

        // Center must be tallest of the three
        if (centerAbs <= leftAbs || centerAbs <= rightAbs) continue

        // Center must be the global peak — nothing outside the cluster is taller
        if (centerAbs < globalPeak) continue

        // Neighbors must be 25–65% of center
        const leftPct = (leftAbs / centerAbs) * 100
        const rightPct = (rightAbs / centerAbs) * 100
        if (leftPct < 25 || leftPct > 65) continue
        if (rightPct < 25 || rightPct > 65) continue

        if (centerAbs > bestCenterGEX) {
          bestCenterGEX = centerAbs
          const totalGEX = leftAbs + centerAbs + rightAbs
          bestCluster = {
            strikes: [left.strike, center.strike, right.strike],
            centralStrike: center.strike,
            totalGEX,
            contributions: [
              Math.round((leftAbs / totalGEX) * 100),
              Math.round((centerAbs / totalGEX) * 100),
              Math.round((rightAbs / totalGEX) * 100),
            ],
            oi: [
              gexSign === 'call' ? left.callOI || 0 : left.putOI || 0,
              gexSign === 'call' ? center.callOI || 0 : center.putOI || 0,
              gexSign === 'call' ? right.callOI || 0 : right.putOI || 0,
            ],
            type: gexSign === 'call' ? ('call' as const) : ('put' as const),
          }
        }
      }

      return bestCluster
    }

    // Find best call and put clusters
    const bestCallCluster = findBestGEXCluster(levels, 'call')
    const bestPutCluster = findBestGEXCluster(levels, 'put')

    // Choose the largest cluster overall
    let largestWall = null

    if (bestCallCluster && bestPutCluster) {
      if (bestCallCluster.totalGEX > bestPutCluster.totalGEX) {
        largestWall = {
          strike: bestCallCluster.centralStrike,
          gex: bestCallCluster.totalGEX / 1e9, // Convert to billions
          type: 'call' as const,
          cluster: bestCallCluster,
        }
      } else {
        largestWall = {
          strike: bestPutCluster.centralStrike,
          gex: bestPutCluster.totalGEX / 1e9, // Convert to billions
          type: 'put' as const,
          cluster: bestPutCluster,
        }
      }
    } else if (bestCallCluster) {
      largestWall = {
        strike: bestCallCluster.centralStrike,
        gex: bestCallCluster.totalGEX / 1e9,
        type: 'call' as const,
        cluster: bestCallCluster,
      }
    } else if (bestPutCluster) {
      largestWall = {
        strike: bestPutCluster.centralStrike,
        gex: bestPutCluster.totalGEX / 1e9,
        type: 'put' as const,
        cluster: bestPutCluster,
      }
    }

    // Calculate pressure (distance to wall) - closer to wall = higher pressure
    let wallWithPressure = null
    if (largestWall) {
      const distanceToWall = Math.abs(currentPrice - largestWall.strike)
      const priceRange = currentPrice * 0.2 // 20% of current price as max range
      const pressureScore = Math.max(1, Math.min(100, 100 - (distanceToWall / priceRange) * 100))

      wallWithPressure = {
        ...largestWall,
        pressure: Math.round(pressureScore),
      }
    }

    return {
      ticker: symbol,
      attractionLevel,
      dealerSweat,
      currentPrice,
      netGex: netGexBillions,
      marketCap,
      gexImpactScore,
      largestWall: wallWithPressure || undefined,
    }
  } catch (error) {
    console.error(`Error calculating GEX for ${symbol}:`, error)
    return null
  }
}

// Process symbols in parallel batches — concurrency capped to avoid Polygon rate limits.
// 8 symbols × 2 Polygon calls = 16 concurrent requests per batch.
async function processBatchParallel(
  symbols: string[],
  baseUrl: string,
  expirationFilter: string = 'Default',
  maxConcurrency: number = 8
): Promise<GEXData[]> {
  const results: GEXData[] = []

  for (let i = 0; i < symbols.length; i += maxConcurrency) {
    const batch = symbols.slice(i, i + maxConcurrency)

    const batchPromises = batch.map((symbol) =>
      calculateSymbolGEX(symbol, baseUrl, expirationFilter)
    )
    const batchResults = await Promise.allSettled(batchPromises)

    const validResults = batchResults
      .filter(
        (result): result is PromiseFulfilledResult<GEXData> =>
          result.status === 'fulfilled' && result.value !== null
      )
      .map((result) => result.value)

    results.push(...validResults)

    if (i + maxConcurrency < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  return results
}

// Legacy function for backward compatibility
async function processBatch(
  symbols: string[],
  baseUrl: string,
  expirationFilter: string = 'Default'
): Promise<GEXData[]> {
  return processBatchParallel(symbols, baseUrl, expirationFilter, 15)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 1000)
    const streaming = searchParams.get('stream') === 'true'
    const expirationFilter = searchParams.get('expirationFilter') || 'Default'
    const symbolsParam = searchParams.get('symbols')

    // Determine which symbols to process
    let symbolsToProcess: string[]
    if (symbolsParam) {
      symbolsToProcess = symbolsParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0)
    } else {
      // Use default top symbols
      symbolsToProcess = TOP_SCREENER_SYMBOLS.slice(0, Math.min(limit, 1000))
    }

    // If not streaming, use optimized parallel batch processing with MAXIMUM SPEED
    if (!streaming) {
      // Get base URL for internal API calls
      const host = request.nextUrl.host
      const protocol = request.nextUrl.protocol
      const baseUrl = `${protocol}//${host}`

      const startTime = Date.now()
      const allResults = await processBatchParallel(symbolsToProcess, baseUrl, expirationFilter, 8)
      const processingTime = Date.now() - startTime

      // Sort by GEX Impact Score (highest impact relative to market cap first)
      const sortedResults = allResults
        .filter((result) => result.dealerSweat !== 0)
        .sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0))

      return NextResponse.json({
        success: true,
        data: sortedResults,
        timestamp: new Date().toISOString(),
        count: sortedResults.length,
        processingTimeMs: processingTime,
        symbolsProcessed: symbolsToProcess.length,
        expirationFilter,
      })
    }

    // Streaming response with PARALLEL BATCH PROCESSING for speed
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Get base URL for internal API calls
          const host = request.nextUrl.host
          const protocol = request.nextUrl.protocol
          const baseUrl = `${protocol}//${host}`

          const allResults: GEXData[] = []

          // Send initial message
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'start',
                total: symbolsToProcess.length,
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          )

          // 8 symbols × 2 Polygon calls = 16 concurrent requests — stays well under rate limits
          const BATCH_SIZE = 8
          const BATCH_DELAY = 100 // Small pause between bursts

          for (let i = 0; i < symbolsToProcess.length; i += BATCH_SIZE) {
            const batch = symbolsToProcess.slice(i, i + BATCH_SIZE)

            // getOptionsDataDirect already has its own AbortController timeout (18s).
            // No outer Promise.race needed — that pattern leaks uncancelled setTimeouts.
            const batchPromises = batch.map((symbol) =>
              calculateSymbolGEX(symbol, baseUrl, expirationFilter).catch((error) => {
                console.error(`❌ Error processing ${symbol}:`, error)
                return null
              })
            )

            const batchResults = await Promise.allSettled(batchPromises)

            // Extract successful results and send updates
            batchResults.forEach((result, batchIdx) => {
              if (result.status === 'fulfilled' && result.value && result.value.dealerSweat !== 0) {
                allResults.push(result.value)

                // Send individual result
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'result',
                      data: result.value,
                      progress: i + batchIdx + 1,
                      total: symbolsToProcess.length,
                      timestamp: new Date().toISOString(),
                    })}\n\n`
                  )
                )
              }
            })

            if (i + BATCH_SIZE < symbolsToProcess.length) {
              await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
            }
          }

          // Send final sorted results by GEX Impact Score
          const sortedResults = allResults.sort(
            (a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0)
          )

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'complete',
                data: sortedResults,
                count: sortedResults.length,
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          )

          controller.close()
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('GEX Screener API Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch GEX screener data',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbols } = body

    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json({ success: false, error: 'Invalid symbols array' }, { status: 400 })
    }

    // Get base URL for internal API calls
    const host = request.nextUrl.host
    const protocol = request.nextUrl.protocol
    const baseUrl = `${protocol}//${host}`

    const batchSize = 5
    const batches = []

    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize))
    }

    const allResults: GEXData[] = []

    for (let i = 0; i < batches.length; i++) {
      const batchResults = await processBatch(batches[i], baseUrl)
      allResults.push(...batchResults)

      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    const sortedResults = allResults
      .filter((result) => result.dealerSweat !== 0)
      .sort((a, b) => Math.abs(b.dealerSweat) - Math.abs(a.dealerSweat))

    return NextResponse.json({
      success: true,
      data: sortedResults,
      timestamp: new Date().toISOString(),
      count: sortedResults.length,
    })
  } catch (error) {
    console.error('GEX Screener POST API Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process custom symbols',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
