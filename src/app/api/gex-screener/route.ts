import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Top symbols to screen - comprehensive market coverage (1,451 symbols)
const TOP_SCREENER_SYMBOLS = [
    'A', 'AA', 'AAL', 'AAOI', 'AAON', 'AAPG', 'AAP', 'AAPL', 'AAUC', 'AB', 'ABBV', 'ABCB',
    'ABEV', 'ABG', 'ABM', 'ABNB', 'ABR', 'ABTC', 'ABT', 'ABVX', 'ACA', 'ACAD', 'ACGL',
    'ACGLN', 'ACGLO', 'ACHC', 'ACHR', 'ACI', 'ACIW', 'ACLS', 'ACLX', 'ACM', 'ACMR', 'ACN',
    'ACT', 'AD', 'ADAMI', 'ADAML', 'ADAMM', 'ADAMN', 'ADBE', 'ADC', 'ADI', 'ADMA', 'ADM',
    'ADP', 'ADPT', 'ADSK', 'ADT', 'ADUS', 'AEE', 'AEG', 'AEIS', 'AEM', 'AEO', 'AEP',
    'AER', 'AES', 'AFG', 'AFL', 'AFRM', 'AG', 'AGCO', 'AGIO', 'AGI', 'AGNC', 'AGNCL',
    'AGNCM', 'AGNCN', 'AGNCO', 'AGNCP', 'AGNCZ', 'AGO', 'AGX', 'AGYS', 'AHL', 'AHR',
    'AI', 'AIG', 'AIR', 'AIT', 'AIZ', 'AJG', 'AKAM', 'AKR', 'AKRO', 'AL', 'ALAB',
    'ALB', 'ALC', 'ALE', 'ALG', 'ALGM', 'ALGN', 'ALH', 'ALHC', 'ALK', 'ALL', 'ALLE',
    'ALLY', 'ALKS', 'ALKT', 'ALSN', 'ALNY', 'ALRM', 'ALV', 'ALVO', 'AM', 'AMAT', 'AMBA',
    'AMBP', 'AMCR', 'AMD', 'AME', 'AMG', 'AMGN', 'AMH', 'AMKR', 'AMP', 'AMR', 'AMRC',
    'AMRX', 'AMRZ', 'AMSC', 'AMT', 'AMTM', 'AMZN', 'AMX', 'AN', 'ANET', 'ANF', 'ANIP',
    'AON', 'AORT', 'AOS', 'APA', 'APAM', 'APD', 'APGE', 'APG', 'APH', 'APLE', 'APLD',
    'APLS', 'APO', 'APOS', 'APP', 'APPF', 'APPN', 'APTV', 'AQN', 'AQNB', 'AR', 'ARCC',
    'ARDT', 'ARE', 'ARES', 'ARGX', 'ARLP', 'ARLO', 'ARM', 'ARMK', 'ARMN', 'AROC', 'ARQT', 'ARWR',
    'ARW', 'ARX', 'AS', 'ASAN', 'ASB', 'ASBA', 'ASGN', 'ASH', 'ASML', 'ASND', 'ASO',
    'ASR', 'ASTS', 'ASX', 'ATAT', 'ATEC', 'ATGE', 'ATHM', 'ATHS', 'ATI', 'ATKR', 'ATMU',
    'ATO', 'ATR', 'ATS', 'AU', 'AUB', 'AUGO', 'AUR', 'AVA', 'AVAL', 'AVAV', 'AVB',
    'AVGO', 'AVNT', 'AVPT', 'AVT', 'AVTR', 'AVY', 'AWI', 'AWK', 'AWR', 'AX', 'AXON',
    'AXP', 'AXSM', 'AXS', 'AXTA', 'AYI', 'AZN', 'AZO', 'AZZ', 'B', 'BA', 'BABA',
    'BAC', 'BAH', 'BALL', 'BAM', 'BANC', 'BANF', 'BANR', 'BAP', 'BATRA', 'BATRK', 'BAX',
    'BB', 'BBAI', 'BBAR', 'BBD', 'BBDO', 'BBIO', 'BBT', 'BBU', 'BBUC', 'BBVA', 'BBWI',
    'BBY', 'BC', 'BCC', 'BCE', 'BCH', 'BCO', 'BCPC', 'BCS', 'BDC', 'BDX', 'BE',
    'BEAM', 'BEKE', 'BEN', 'BEP', 'BEPC', 'BEPH', 'BEPI', 'BEPJ', 'BFAM', 'BFH', 'BG',
    'BGC', 'BHC', 'BHF', 'BHP', 'BIDU', 'BIIB', 'BILI', 'BILL', 'BIO', 'BIP', 'BIPC',
    'BIPH', 'BIPJ', 'BIRK', 'BITF', 'BJ', 'BK', 'BKD', 'BKE', 'BKH', 'BKNG', 'BKR',
    'BKU', 'BL', 'BLCO', 'BLD', 'BLDR', 'BLK', 'BLKB', 'BLSH', 'BLTE', 'BMA', 'BMI',
    'BMO', 'BMRN', 'BMNR', 'BMY', 'BN', 'BNH', 'BNJ', 'BNL', 'BNS', 'BNT', 'BNTX', 'BOH',
    'BOKF', 'BOOT', 'BOX', 'BP', 'BPOP', 'BPYPM', 'BPYPN', 'BPYPO', 'BPYPP', 'BR', 'BRBR',
    'BRC', 'BRK/A', 'BRK/B', 'BRKR', 'BRKRP', 'BRO', 'BROS', 'BRSL', 'BRX', 'BRZE', 'BSAC',
    'BSBR', 'BSM', 'BSX', 'BSY', 'BTDR', 'BTI', 'BTSG', 'BTSGU', 'BTG', 'BTU', 'BUD', 'BULL',
    'BULLW', 'BUR', 'BURL', 'BUSE', 'BUSEP', 'BVN', 'BWA', 'BWIN', 'BWNB', 'BWSN', 'BWXT',
    'BX', 'BXMT', 'BXP', 'BYD', 'BZ', 'C', 'CAAP', 'CACI', 'CACC', 'CADE', 'CAE',
    'CAG', 'CAH', 'CAI', 'CAKE', 'CALM', 'CALX', 'CAMT', 'CAR', 'CARG', 'CARR', 'CART',
    'CASY', 'CAT', 'CATY', 'CAVA', 'CB', 'CBRE', 'CBSH', 'CBT', 'CBU', 'CBZ', 'CC',
    'CCCS', 'CCEP', 'CCI', 'CCOI', 'CCJ', 'CCK', 'CCL', 'CCZ', 'CDE', 'CDP', 'CDNS',
    'CDTX', 'CDW', 'CE', 'CEG', 'CET', 'CELC', 'CELH', 'CENT', 'CENX', 'CERT', 'CF', 'CFG',
    'CFLT', 'CFR', 'CG', 'CGABL', 'CGAU', 'CGNX', 'CGON', 'CHA', 'CHD', 'CHDN', 'CHE',
    'CHEF', 'CHH', 'CHKP', 'CHRD', 'CHRW', 'CHT', 'CHTR', 'CHWY', 'CHYM', 'CI', 'CIB',
    'CIEN', 'CIFR', 'CIFRW', 'CIG', 'CIGI', 'CII', 'CIMN', 'CINF', 'CIVI', 'CL', 'CLBT',
    'CLF', 'CLH', 'CLS', 'CLSK', 'CLVT', 'CLX', 'CM', 'CMA', 'CMBT', 'CMC', 'CMCM',
    'CMCSA', 'CME', 'CMG', 'CMI', 'CMPO', 'CMS', 'CMSA', 'CMSC', 'CMSD', 'CNA', 'CNC',
    'CNH', 'CNI', 'CNK', 'CNM', 'CNO', 'CNP', 'CNQ', 'CNR', 'CNS', 'CNTA', 'CNXC',
    'CNX', 'COCO', 'COF', 'COGT', 'COHR', 'COIN', 'COKE', 'COLB', 'COLD', 'COLM', 'COMM',
    'COMP', 'CON', 'COO', 'COP', 'COR', 'CORT', 'CORZ', 'CORZW', 'CORZZ', 'COST', 'COTY',
    'CP', 'CPA', 'CPAY', 'CPB', 'PCH', 'CPK', 'CPNG', 'CPRI', 'CPRT', 'CPRX', 'CPT',
    'CQP', 'CR', 'CRBG', 'CRC', 'CRCL', 'CRDO', 'CRGY', 'CRH', 'CRK', 'CRL', 'CRM',
    'CRNX', 'CROX', 'CRS', 'CRSP', 'CRUS', 'CRVL', 'CRWD', 'CRWV', 'CSAN', 'CSCO', 'CSGP',
    'CSL', 'CSQ', 'CSTM', 'CSW', 'CSX', 'CTAS', 'CTSH', 'CTRA', 'CTRE', 'CTVA', 'CUBE',
    'CUBI', 'CUK', 'CURB', 'CUZ', 'CVBF', 'CVCO', 'CVE', 'CVI', 'CVLT', 'CVNA', 'CVS',
    'CVX', 'CW', 'CWAN', 'CWEN', 'CWK', 'CWST', 'CWT', 'CX', 'CXT', 'CXW', 'CYBR',
    'CYTK', 'CZR', 'D', 'DAL', 'DAN', 'DAR', 'DASH', 'DAVE', 'DAY', 'DB', 'DBD',
    'DBRG', 'DBX', 'DCI', 'DD', 'DDOG', 'DDS', 'DE', 'DECK', 'DEI', 'DELL', 'DEO',
    'DFH', 'DG', 'DGNX', 'DGX', 'DHCNI', 'DHCNL', 'DHI', 'DHR', 'DHT', 'DINO', 'DIOD',
    'DIS', 'DJT', 'DK', 'DKNG', 'DKL', 'DKS', 'DLB', 'DLO', 'DLR', 'DLTR', 'DNLI', 'DNN',
    'DOC', 'DOCN', 'DOCS', 'DOCU', 'DOOO', 'DORM', 'DOV', 'DOW', 'DOX', 'DPZ', 'DRD',
    'DRI', 'DRS', 'DRVN', 'DSGX', 'DT', 'DTB', 'DTE', 'DTG', 'DTM', 'DTW', 'DUK',
    'DUKB', 'DUOL', 'DVA', 'DVN', 'DXC', 'DXCM', 'DY', 'DYN', 'E', 'EA', 'EAI',
    'EAT', 'EBAY', 'EBC', 'EBR', 'EC', 'ECCF', 'ECG', 'ECL', 'ED', 'EDU', 'EE',
    'EEFT', 'EFX', 'EG', 'EGO', 'EGP', 'EHC', 'EIX', 'EL', 'ELAN', 'ELC', 'ELF',
    'ELP', 'ELPC', 'ELS', 'ELV', 'EMA', 'EME', 'EMN', 'EMP', 'EMR', 'ENB', 'ENIC',
    'ENJ', 'ENLT', 'ENO', 'ENPH', 'ENS', 'ENSG', 'ENTG', 'ENVA', 'ENVX', 'EOG', 'EOSE',
    'EPAC', 'EPAM', 'EPD', 'EPR', 'EPRT', 'EQH', 'EQIX', 'EQNR', 'EQR', 'EQT', 'EQX', 'ERIC',
    'ERIE', 'ERJ', 'ERO', 'ES', 'ESAB', 'ESE', 'ESI', 'ESLT', 'ESNT', 'ESS', 'ESTC',
    'ETHA', 'ETNB', 'ETOR', 'ET', 'ETN', 'ETR', 'ETSY', 'EVCM', 'EVR', 'EVRG', 'EW',
    'EWBC', 'EXAS', 'EXC', 'EXE', 'EXEEL', 'EXEL', 'EXK', 'EXLS', 'EXP', 'EXPD', 'EXPE',
    'EXPO', 'EXR', 'EXTR', 'EYE', 'F', 'FA', 'FAF', 'FANG', 'FAST', 'FBIN', 'FBNC',
    'FBK', 'FBP', 'FCFS', 'FCNCA', 'FCN', 'FCPT', 'FCX', 'FDX', 'FE', 'FELE', 'FER',
    'FERG', 'FFBC', 'FFIN', 'FFIV', 'FG', 'FGN', 'FHB', 'FHI', 'FHN', 'FI', 'FIBK',
    'FICO', 'FIG', 'FIGR', 'FIHL', 'FIS', 'FITB', 'FITBI', 'FITBO', 'FITBP', 'FIVE', 'FIX',
    'FIZZ', 'FLEX', 'FLG', 'FLNC', 'FLO', 'FLR', 'FLS', 'FLUT', 'FLY', 'FMC', 'FMS',
    'FMX', 'FN', 'FNB', 'FND', 'FNF', 'FNV', 'FOLD', 'FORM', 'FORTY', 'FOUR', 'FOX',
    'FOXA', 'FR', 'FRHC', 'FRME', 'FRMI', 'FRO', 'FROG', 'FRPT', 'FRSH', 'FRT', 'FSLR',
    'FSK', 'FSM', 'FSS', 'FSV', 'FTAI', 'FTAIM', 'FTAIN', 'FTDR', 'FTI', 'FTNT', 'FTS',
    'FTV', 'FUL', 'FULT', 'FULTP', 'FUN', 'FUTU', 'FWONA', 'FWONK', 'FYBR', 'G', 'GAP',
    'GATX', 'GBCI', 'GBDC', 'GBTG', 'GCMG', 'GD', 'GDDY', 'GDS', 'GDV', 'GE', 'GEF',
    'GEHC', 'GEMI', 'GEN', 'GENI', 'GENVR', 'GEO', 'GEV', 'GFF', 'GFI', 'GFL', 'GFS',
    'GGAL', 'GGB', 'GGG', 'GH', 'GHC', 'GIB', 'GILD', 'GIL', 'GIS', 'GKOS', 'GL',
    'GLBE', 'GLOB', 'GLNG', 'GLPG', 'GLPI', 'GLW', 'GLXY', 'GM', 'GMAB', 'GME', 'GMED',
    'GNRC', 'GNTX', 'GNW', 'GOLF', 'GOOG', 'GOOGL', 'GPC', 'GPI', 'GPK', 'GPN', 'GPOR',
    'GRAB', 'GRAL', 'GRBK', 'GRFS', 'GRMN', 'GRND', 'GS', 'GSAT', 'GSHD', 'GSK', 'GT',
    'GTLB', 'GTLS', 'GTM', 'GTX', 'GVA', 'GWRE', 'GWW', 'GXO', 'H', 'HAE', 'HAFN',
    'HAL', 'HALO', 'HAS', 'HASI', 'HBAN', 'HBANL', 'HBANM', 'HBANP', 'HBI', 'HBM', 'HCA',
    'HCC', 'HCM', 'HCI', 'HCXY', 'HD', 'HDB', 'HE', 'HEI', 'HESM', 'HGTY', 'HGV',
    'HHH', 'HI', 'HIG', 'HII', 'HIMS', 'HIW', 'HL', 'HLI', 'HLNE', 'HLN', 'HLT',
    'HMC', 'HMY', 'HNGE', 'HNI', 'HOG', 'HOLX', 'HOMB', 'HON', 'HOOD', 'HP', 'HPE',
    'HPQ', 'HQY', 'HR', 'HRB', 'HRI', 'HRL', 'HSAI', 'HSBC', 'HSIC', 'HST', 'HSY',
    'HTFL', 'HTGC', 'HTHT', 'HTH', 'HUBB', 'HUBG', 'HUBS', 'HUM', 'HURN', 'HUT', 'HWC',
    'HWCPZ', 'HWKN', 'HWM', 'HXL', 'IAC', 'IAG', 'IBIT', 'IBM', 'IBKR', 'IBN', 'IBOC',
    'IBRX', 'IBP', 'ICE', 'ICLR', 'ICL', 'ICUI', 'IDA', 'IDCC', 'IDXX', 'IDYA', 'IEP', 'IE',
    'IESC', 'IEX', 'IFF', 'IFS', 'IHG', 'IHS', 'ILMN', 'IMVT', 'INCY', 'INDB', 'INDV',
    'INFA', 'INFY', 'ING', 'INGM', 'INGR', 'INOD', 'INSM', 'INSP', 'INSW', 'INTA', 'INTC',
    'INTR', 'INTU', 'INVH', 'IONQ', 'IONS', 'IOT', 'IPAR', 'IP', 'IPG', 'IPGP', 'IQ',
    'IQV', 'IR', 'IREN', 'IRM', 'IRON', 'IRTC', 'IRT', 'ISRG', 'IT', 'ITGR', 'ITRI',
    'ITT', 'ITUB', 'ITW', 'IVT', 'IVZ', 'IX', 'J', 'JAZZ', 'JBL', 'JBHT', 'JBS',
    'JBTM', 'JCI', 'JD', 'JEF', 'JHG', 'JHX', 'JKHY', 'JLL', 'JNJ', 'JOBY', 'JOE',
    'JOYY', 'JPM', 'JXN', 'K', 'KAI', 'KAR', 'KB', 'KBH', 'KBR', 'KC', 'KD',
    'KDP', 'KEN', 'KEP', 'KEX', 'KEY', 'KEYS', 'KFY', 'KGC', 'KGS', 'KHC', 'KIM',
    'KKR', 'KKRS', 'KLAC', 'KLAR', 'KLIC', 'KMB', 'KMI', 'KMPR', 'KMX', 'KN', 'KNF',
    'KNSA', 'KNSL', 'KNTK', 'KNX', 'KO', 'KOF', 'KR', 'KRC', 'KRG', 'KRMN', 'KRYS',
    'KSPI', 'KT', 'KTB', 'KTOS', 'KVUE', 'KVYO', 'KWR', 'KYIV', 'KYMR', 'L', 'LAD',
    'LAMR', 'LAUR', 'LAZ', 'LB', 'LBRDA', 'LBRDK', 'LBRDP', 'LBRT', 'LBTYA', 'LBTYB', 'LBTYK',
    'LC', 'LCID', 'LCII', 'LDOS', 'LEA', 'LECO', 'LEGN', 'LEU', 'LEN', 'LEVI', 'LFST', 'LFUS',
    'LGN', 'LGND', 'LH', 'LHX', 'LI', 'LIF', 'LII', 'LIN', 'LINE', 'LITE', 'LIVN',
    'LKQ', 'LLYVA', 'LLYVK', 'LLY', 'LMAT', 'LMND', 'LMT', 'LNC', 'LNG', 'LNT', 'LNTH',
    'LNW', 'LOAR', 'LOGI', 'LOPE', 'LOW', 'LPLA', 'LPL', 'LPX', 'LRCX', 'LRN', 'LSCC',
    'LSTR', 'LTH', 'LTM', 'LU', 'LULU', 'LUMN', 'LUNR', 'LUV', 'LVS', 'LW', 'LXP',
    'LYB', 'LYFT', 'LYG', 'LYV', 'M', 'MA', 'MAA', 'MAC', 'MAIN', 'MANH', 'MANU',
    'MAR', 'MARA', 'MAS', 'MASI', 'MAT', 'MATX', 'MBLY', 'MC', 'MCHB', 'MCHP', 'MCHPP',
    'MCD', 'MCK', 'MCO', 'MCY', 'MDB', 'MDGL', 'MDLZ', 'MDT', 'MDU', 'MEDP', 'MELI',
    'MENS', 'MEOH', 'MESO', 'META', 'METC', 'MET', 'MFAN', 'MFAO', 'MFC', 'MFICL', 'MFG',
    'MGA', 'MGEE', 'MGM', 'MGNI', 'MGRC', 'MGY', 'MH', 'MHK', 'MHO', 'MIAX', 'MIDD',
    'MIR', 'MIRM', 'MKC', 'MKL', 'MKSI', 'MKTX', 'MLI', 'MLCO', 'MLM', 'MLYS', 'MMC',
    'MMM', 'MMS', 'MMSI', 'MMYT', 'MNDY', 'MNSO', 'MNST', 'MO', 'MOD', 'MOH', 'MORN',
    'MOS', 'MP', 'MPC', 'MPLX', 'MPWR', 'MPW', 'MQ', 'MRCY', 'MRK', 'MRNA', 'MRP',
    'MRUS', 'MRVL', 'MRX', 'MS', 'MSA', 'MSCI', 'MSFT', 'MSGE', 'MSGS', 'MSI', 'MSM',
    'MSTR', 'MT', 'MTB', 'MTCH', 'MTD', 'MTDR', 'MTG', 'MTH', 'MTN', 'MTRN', 'MTSI',
    'MTSR', 'MTZ', 'MU', 'MUFG', 'MUR', 'MUSA', 'MWA', 'MYRG', 'MZTI', 'NAMS', 'NAMSW',
    'NAN', 'NATL', 'NBIS', 'NBIX', 'NBTB', 'NCLH', 'NCNO', 'NDAQ', 'NDSN', 'NE', 'NEE',
    'NEM', 'NET', 'NEU', 'NG', 'NFLX', 'NFG', 'NGG', 'NGD', 'NGVT', 'NHI', 'NI', 'NICE', 'NIO',
    'NIQ', 'NJR', 'NKE', 'NLY', 'NMFCZ', 'NMIH', 'NMRK', 'NMR', 'NNN', 'NNNN', 'NNI',
    'NOC', 'NOG', 'NOK', 'NOV', 'NOVT', 'NOW', 'NP', 'NPO', 'NRG', 'NSA', 'NSC',
    'NSIT', 'NTAP', 'NTES', 'NTLA', 'NTNX', 'NTRA', 'NTR', 'NTRS', 'NTRSO', 'NTSK', 'NU',
    'NUE', 'NUVL', 'NVAWW', 'NVDA', 'NVMI', 'NVO', 'NVST', 'NVTS', 'NVR', 'NVS', 'NVT',
    'NWE', 'NWG', 'NWL', 'NWS', 'NWSA', 'NXE', 'NXPI', 'NXST', 'NXT', 'NYT', 'O',
    'OBDC', 'OC', 'ODD', 'ODFL', 'OGE', 'OGN', 'OGS', 'OHI', 'OII', 'OKE', 'OKLO',
    'OKTA', 'OLED', 'OLN', 'OLLI', 'OMAB', 'OMC', 'OMF', 'ON', 'ONB', 'ONBPO', 'ONBPP',
    'ONC', 'ONON', 'ONTO', 'OPCH', 'OPEN', 'OR', 'ORA', 'ORCL', 'ORI', 'ORLA', 'ORLY', 'OSCR',
    'OS', 'OSIS', 'OSK', 'OSW', 'OTEX', 'OTF', 'OTIS', 'OTTR', 'OUST', 'OUT', 'OVV',
    'OWL', 'OXLC', 'OXLCL', 'OXLCN', 'OXLCO', 'OXLCP', 'OXLCZ', 'OXY', 'OZK', 'PAA',
    'PAAS', 'PAC', 'PAG', 'PAGP', 'PAGS', 'PAM', 'PANW', 'PARR', 'PATH', 'PATK', 'PAX',
    'PAY', 'PAYC', 'PAYO', 'PAYX', 'PB', 'PBA', 'PBF', 'PBH', 'PBI', 'PBR', 'PCAR',
    'PCG', 'PCH', 'PCOR', 'PCT', 'PCTY', 'PCVX', 'PDD', 'PDI', 'PECO', 'PEG', 'PEGA',
    'PEN', 'PENN', 'PEP', 'PFE', 'PFG', 'PFGC', 'PFH', 'PFS', 'PFSI', 'PG', 'PGR',
    'PGY', 'PH', 'PHG', 'PHI', 'PHIN', 'PHM', 'PI', 'PII', 'PINC', 'PINS', 'PIPR',
    'PJT', 'PK', 'PKG', 'PKX', 'PL', 'PLBL', 'PLD', 'PLMR', 'PLNT', 'PLTR', 'PLUG',
    'PLXS', 'PM', 'PMTU', 'PNC', 'PNFP', 'PNR', 'PNW', 'PODD', 'PONY', 'POOL', 'POR',
    'POST', 'POWI', 'POWL', 'POWWP', 'PPC', 'PPG', 'PPL', 'PPTA', 'PR', 'PRAX', 'PRCH',
    'PRDO', 'PRGO', 'PRH', 'PRI', 'PRIM', 'PRKS', 'PRK', 'PRM', 'PRMB', 'PRS', 'PRU', 'PRVA',
    'PSA', 'PSKY', 'PSMT', 'PSN', 'PSO', 'PSTG', 'PSX', 'PTC', 'PTCT', 'PTEN', 'PTGX',
    'PTON', 'PTRN', 'PUK', 'PVH', 'PWR', 'PYPL', 'QBTS', 'QCOM', 'QDEL', 'QFIN', 'QGEN',
    'QLYS', 'QRVO', 'QS', 'QSR', 'QTWO', 'QUBT', 'QURE', 'QXO', 'R', 'RACE', 'RAL',
    'RARE', 'RBA', 'RBC', 'RBLX', 'RBRK', 'RCB', 'RCC', 'RCI', 'RCL', 'RDDT', 'RDN',
    'RDNT', 'RDY', 'REG', 'REGCO', 'REGCP', 'REGN', 'RELX', 'RELY', 'REVG', 'REXR', 'REYN',
    'REZI', 'RF', 'RGA', 'RGC', 'RGEN', 'RGLD', 'RGTI', 'RGTIW', 'RH', 'RHI', 'RIOT',
    'RIVN', 'RKLB', 'RMBS', 'RNA', 'RNW', 'ROAD', 'ROCK', 'ROIV', 'ROKU', 'ROP', 'ROST',
    'RPRX', 'RRR', 'RUM', 'RUN', 'RUSHA', 'RUSHB', 'RVMD', 'RXRX', 'RYAAY', 'RYTM', 'SAIA',
    'SAIC', 'SAIL', 'SANM', 'SATS', 'SBAC', 'SBCF', 'SBET', 'SBLK', 'SBRA', 'SBUX', 'SEDG',
    'SEB', 'SEIC', 'SEZL', 'SFD', 'SFM', 'SFNC', 'SGRY', 'SHC', 'SHOO', 'SHOP', 'SIGI',
    'SIM', 'SIMO', 'SIRI', 'SITM', 'SKYW', 'SLAB', 'SLM', 'SLMBP', 'SLNO', 'SMCI', 'SMMT',
    'SMPL', 'SMTC', 'SNDK', 'SNEX', 'SNPS', 'SNY', 'SOFI', 'SOLSV', 'SONO', 'SOUN', 'SOUNW',
    'SPNS', 'SPSC', 'SRAD', 'SRPT', 'SRRK', 'SSNC', 'SSRM', 'STEP', 'STLD', 'STNE', 'STRA',
    'STRC', 'STRD', 'STRF', 'STRK', 'STRL', 'STX', 'SUPN', 'SWKS', 'SYBT', 'SYM', 'SYNA',
    'TARS', 'TBBK', 'TCBI', 'TCOM', 'TEAM', 'TECH', 'TEM', 'TENB', 'TER', 'TFSL', 'TGTX',
    'TIGO', 'TLN', 'TLX', 'TMC', 'TMDX', 'TMUS', 'TOWN', 'TPG', 'TPGXL', 'TRI', 'TRMB',
    'TRMD', 'TRMK', 'TROW', 'TSCO', 'TSEM', 'TSLA', 'TTAN', 'TTD', 'TTEK', 'TTMI', 'TTWO',
    'TVTX', 'TW', 'TWST', 'TXN', 'TXRH', 'UAL', 'UBSI', 'UEC', 'UFPI', 'ULTA', 'UMBF',
    'UMBFO', 'UPST', 'UPWK', 'URBN', 'USAR', 'USLM', 'UTHR', 'UUUU', 'VC', 'VCTR', 'VCYT',
    'VEON', 'VERX', 'VFS', 'VIAV', 'VICR', 'VKTX', 'VLY', 'VLYPN', 'VLYPO', 'VLYPP', 'VNET',
    'VNOM', 'VOD', 'VRNS', 'VRRM', 'VRSK', 'VRSN', 'VRTX', 'VSAT', 'VSEC', 'VTRS', 'WAFD',
    'WAY', 'WB', 'WBD', 'WBTN', 'WDAY', 'WDC', 'WDFC', 'WFRD', 'WGS', 'WING', 'WIX',
    'WMG', 'WRD', 'WSBC', 'WSBCO', 'WSBCP', 'WSC', 'WSFS', 'WTFC', 'WTW', 'WULF', 'WWD',
    'WYNN', 'XEL', 'XENE', 'XMTR', 'XNET', 'XP', 'XRAY', 'Z', 'ZBRA', 'ZG', 'ZION',
    'ZIONP', 'ZLAB', 'ZM', 'ZS'
];

interface GEXData {
    ticker: string;
    attractionLevel: number;
    dealerSweat: number;
    currentPrice: number;
    netGex: number;
    marketCap?: number;
    gexImpactScore?: number;
    vex?: number;
    dex?: number;
    si?: number;
    // Wall data for Support/Resistance
    largestWall?: {
        strike: number;
        gex: number;
        type: 'call' | 'put';
        pressure: number; // 1-100 based on distance to wall
        cluster?: {
            strikes: number[];
            centralStrike: number;
            totalGEX: number;
            contributions: number[]; // Percentage contributions
            type: 'call' | 'put';
        };
    };
}

// Get market cap data from Polygon
async function getMarketCap(symbol: string): Promise<number> {
    try {
        const response = await fetch(
            `https://api.polygon.io/v3/reference/tickers/${symbol}?apikey=${POLYGON_API_KEY}`,
            { next: { revalidate: 86400 } } // Cache for 24 hours (market cap changes slowly)
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch market cap for ${symbol}`);
        }

        const data = await response.json();
        const marketCap = data.results?.market_cap;

        return marketCap || 0;
    } catch (error) {
        console.error(`Error fetching market cap for ${symbol}:`, error);
        return 0;
    }
}

// Calculate GEX Impact Score: how much the GEX can move the stock relative to market cap
function calculateGEXImpactScore(gexValue: number, marketCap: number): number {
    if (marketCap === 0) return 0;

    // Convert GEX from billions to actual value, and market cap is already in dollars
    const gexDollars = Math.abs(gexValue) * 1e9;

    // Calculate GEX as percentage of market cap
    const gexToMarketCapRatio = gexDollars / marketCap;

    let impactScore: number;

    // Different scaling for different market cap tiers
    if (marketCap >= 1e12) { // $1T+ mega-caps (NVDA, AAPL, MSFT, etc.)
        // Realistic scaling based on actual GEX levels: 0.5% = 100 points, 0.25% = 50 points
        impactScore = Math.min(100, (gexToMarketCapRatio * 20000));
    } else if (marketCap >= 500e9) { // $500B-$1T large caps
        // Medium scaling: 1.5% = 100 points, 0.75% = 50 points
        impactScore = Math.min(100, (gexToMarketCapRatio * 6667));
    } else if (marketCap >= 100e9) { // $100B-$500B mid-large caps
        // Standard scaling: 1% = 100 points, 0.5% = 50 points
        impactScore = Math.min(100, (gexToMarketCapRatio * 10000));
    } else { // <$100B smaller caps
        // More sensitive scaling: 0.5% = 100 points, 0.25% = 50 points
        impactScore = Math.min(100, (gexToMarketCapRatio * 20000));
    }

    return Math.round(impactScore);
}

// Get options data using the same method as the working GEX endpoint with TIMEOUT
async function getOptionsData(symbol: string, baseUrl: string, timeoutMs: number = 5000): Promise<any> {
    try {
        // Create abort controller for timeout - 5 seconds max
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(`${baseUrl}/api/options-chain?ticker=${symbol}`, {
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            return null;
        }

        const result = await response.json();

        if (!result.success) {
            return null;
        }

        return result;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.log(`⏱️ ${symbol}: TIMEOUT - SKIPPING`);
        }
        return null;
    }
}

// Helper function to classify and filter expiration dates based on actual available data
function filterExpirationsByType(expirationDates: string[], filter: string): string[] {
    const today = new Date();

    // Parse and sort expiration dates
    const validDates = expirationDates
        .map(dateStr => ({ dateStr, date: new Date(dateStr) }))
        .filter(item => item.date >= today) // Only future expirations
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (validDates.length === 0) {
        return [];
    }

    console.log(` ${filter} filter: Analyzing ${validDates.length} available future expirations`);

    switch (filter) {
        case 'Week':
            // Weekly options: Find ONLY the next weekly expiry (usually the closest Friday)
            const nextWeekly = validDates[0]; // First available expiration (closest)

            console.log(` Week: Using only next weekly expiry: ${nextWeekly.dateStr}`);
            return [nextWeekly.dateStr];

        case 'Month':
            // Monthly options: Find the monthly expiry (3rd Friday pattern) and include all weeklies up to it
            const monthlyExpiry = validDates.find(item => {
                const dayOfMonth = item.date.getDate();
                const dayOfWeek = item.date.getDay();
                // Monthly expiry is typically 3rd Friday (day 15-21, Friday = 5)
                return dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21;
            });

            if (monthlyExpiry) {
                // Include all expirations up to and including the monthly expiry
                const monthlyExpirations = validDates.filter(item => item.date <= monthlyExpiry.date);
                console.log(` Month: Found monthly expiry ${monthlyExpiry.dateStr}, including ${monthlyExpirations.length} expirations up to it: ${monthlyExpirations.map(d => d.dateStr).join(', ')}`);
                return monthlyExpirations.map(d => d.dateStr);
            } else {
                // Fallback: use expirations within 35 days
                const monthOut = new Date(today.getTime() + 35 * 24 * 60 * 60 * 1000);
                const fallbackMonthly = validDates.filter(item => item.date <= monthOut);
                console.log(` Month: No clear monthly expiry found, using ${fallbackMonthly.length} expirations within 35 days`);
                return fallbackMonthly.map(d => d.dateStr);
            }

        case 'Quad':
            // Quadruple witching: Find the next quarterly expiration and include all expirations up to it
            const quarterlyMonths = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (0-indexed)

            const quarterlyExpiry = validDates.find(item => {
                const month = item.date.getMonth();
                const dayOfMonth = item.date.getDate();
                const dayOfWeek = item.date.getDay();
                // Quarterly expiry: 3rd Friday of Mar/Jun/Sep/Dec
                return quarterlyMonths.includes(month) && dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21;
            });

            if (quarterlyExpiry) {
                // Include ALL expirations (weeklies + monthlies) up to the quarterly expiry
                const quadExpirations = validDates.filter(item => item.date <= quarterlyExpiry.date);
                console.log(` Quad: Found quarterly expiry ${quarterlyExpiry.dateStr}, including ${quadExpirations.length} expirations up to it: ${quadExpirations.map(d => d.dateStr).join(', ')}`);
                return quadExpirations.map(d => d.dateStr);
            }

            // Fallback: if no clear quarterly, use next 90 days
            const quarterOut = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
            const fallbackQuarterly = validDates.filter(item => item.date <= quarterOut);
            console.log(` Quad: No clear quarterly expiry found, using ${fallbackQuarterly.length} expirations within 90 days`);
            return fallbackQuarterly.map(d => d.dateStr);

        default: // 'Default'
            // Default: ALL expirations within 45 days (same as SI screener)
            const fortyFiveDaysOut = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
            const defaultExpirations = validDates.filter(item => item.date <= fortyFiveDaysOut);
            console.log(` Default: Found ${defaultExpirations.length} expirations within 45 days: ${defaultExpirations.map(d => d.dateStr).join(', ')}`);
            return defaultExpirations.map(d => d.dateStr);
    }
}

// Calculate GEX levels for a single symbol using the same logic as working GEX endpoint
async function calculateSymbolGEX(symbol: string, baseUrl: string, expirationFilter: string = 'Default'): Promise<GEXData | null> {
    try {
        const [optionsData, marketCap] = await Promise.all([
            getOptionsData(symbol, baseUrl),
            getMarketCap(symbol)
        ]);

        if (!optionsData || !optionsData.data) {
            return null;
        }

        const currentPrice = optionsData.currentPrice;
        const expirationDates = Object.keys(optionsData.data).sort();

        // IGNORE expirationFilter param - ALWAYS use SI screener logic (3 months → 45 days)
        // STEP 1: Filter to 3 months first (EXACT copy from SI screener line 1426-1431)
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        const expsWithin3Months = expirationDates.filter(exp => {
            const expDate = new Date(exp + 'T00:00:00Z');
            return expDate <= threeMonthsFromNow;
        });

        // STEP 2: Then filter to 45 days (EXACT copy from SI screener line 1434-1438)
        const today = new Date();
        const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000));
        const validExpirations = expsWithin3Months.filter(exp => {
            const expDate = new Date(exp + 'T00:00:00Z');
            return expDate >= today && expDate <= maxDate;
        }).sort();

        if (validExpirations.length === 0) {
            return null;
        }

        // Calculate GEX by strike
        const gexByStrikeByExp: { [strike: number]: { call: number; put: number; callOI: number; putOI: number } } = {};
        let totalNetGex = 0;

        for (const expDate of validExpirations) {
            const { calls, puts } = optionsData.data[expDate];

            // Process calls - ACCUMULATE values for same strikes across expirations (EXACT COPY from SI screener lines 1453-1478)
            if (calls) {
                Object.entries(calls).forEach(([strike, data]: [string, any]) => {
                    const strikeNum = parseFloat(strike);
                    const oi = data.open_interest || 0;

                    if (oi > 0) {
                        if (!gexByStrikeByExp[strikeNum]) {
                            gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
                        }

                        gexByStrikeByExp[strikeNum].callOI += oi;

                        const gamma = data.greeks?.gamma || 0;
                        if (gamma) {
                            const gex = gamma * oi * (currentPrice * currentPrice) * 100;
                            gexByStrikeByExp[strikeNum].call += gex;
                            totalNetGex += gex;
                        }
                    }
                });
            }

            // Process puts - ACCUMULATE values for same strikes across expirations (EXACT COPY from SI screener lines 1480-1508)
            if (puts) {
                Object.entries(puts).forEach(([strike, data]: [string, any]) => {
                    const strikeNum = parseFloat(strike);
                    const oi = data.open_interest || 0;

                    if (oi > 0) {
                        if (!gexByStrikeByExp[strikeNum]) {
                            gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
                        }

                        gexByStrikeByExp[strikeNum].putOI += oi;

                        const gamma = data.greeks?.gamma || 0;
                        if (gamma) {
                            const gex = -gamma * oi * (currentPrice * currentPrice) * 100;
                            gexByStrikeByExp[strikeNum].put += gex;
                            totalNetGex += gex;
                        }
                    }
                });
            }
        }

        const netGexBillions = totalNetGex / 1e9;

        // Find attraction level (strike with highest absolute net GEX)
        let maxAbsGex = 0;
        let attractionLevel = currentPrice;
        let dealerSweat = 0;

        Object.entries(gexByStrikeByExp).forEach(([strike, data]) => {
            const strikeNum = parseFloat(strike);
            const netGex = data.call + data.put;
            const absGex = Math.abs(netGex);

            if (absGex > maxAbsGex) {
                maxAbsGex = absGex;
                attractionLevel = strikeNum;
                dealerSweat = netGex / 1e9; // Convert to billions
            }
        });

        const gexImpactScore = calculateGEXImpactScore(dealerSweat, marketCap);

        // Find clustered GEX zones (2-4 strikes with highest combined GEX, no single strike >60%)
        const levels = Object.entries(gexByStrikeByExp)
            .map(([strike, data]) => ({ strike: parseFloat(strike), call: data.call, put: data.put }))
            .sort((a, b) => a.strike - b.strike); // Sort by strike price for adjacency

        // Function to find the best GEX cluster for a given type (call or put)
        function findBestGEXCluster(strikeData: any[], gexType: 'call' | 'put') {
            const validStrikes = strikeData.filter(s =>
                gexType === 'call' ? s.call > 0 : s.put < 0
            );

            if (validStrikes.length < 2) return null;

            let bestCluster = null;
            let maxClusterGEX = 0;

            // Try clusters of size 2, 3, and 4
            for (let clusterSize = 2; clusterSize <= Math.min(4, validStrikes.length); clusterSize++) {
                const minContribution = clusterSize === 2 ? 0.27 : clusterSize === 3 ? 0.27 : 0.20; // 27% for 2-3 strikes, 20% for 4 strikes

                // Try all possible consecutive clusters of this size
                for (let i = 0; i <= validStrikes.length - clusterSize; i++) {
                    const cluster = validStrikes.slice(i, i + clusterSize);

                    // Calculate total GEX for this cluster
                    const clusterGEXValues = cluster.map(s =>
                        gexType === 'call' ? s.call : Math.abs(s.put)
                    );
                    const totalClusterGEX = clusterGEXValues.reduce((sum, gex) => sum + gex, 0);

                    // Check distribution constraints
                    const contributions = clusterGEXValues.map(gex => gex / totalClusterGEX);
                    const maxContribution = Math.max(...contributions);
                    const minContributionFound = Math.min(...contributions);

                    // Validate constraints: no single strike >60%, no strike <minimum%
                    if (maxContribution <= 0.60 && minContributionFound >= minContribution) {
                        if (totalClusterGEX > maxClusterGEX) {
                            maxClusterGEX = totalClusterGEX;

                            // Find the central strike (weighted average by GEX)
                            const weightedSum = cluster.reduce((sum, s, idx) =>
                                sum + (s.strike * clusterGEXValues[idx]), 0
                            );
                            const centralStrike = weightedSum / totalClusterGEX;

                            bestCluster = {
                                strikes: cluster.map(s => s.strike),
                                centralStrike: Math.round(centralStrike * 100) / 100, // Round to nearest cent
                                totalGEX: totalClusterGEX,
                                contributions: contributions.map(c => Math.round(c * 100)), // Convert to percentages
                                type: gexType === 'call' ? 'call' as const : 'put' as const
                            };
                        }
                    }
                }
            }

            return bestCluster;
        }

        // Find best call and put clusters
        const bestCallCluster = findBestGEXCluster(levels, 'call');
        const bestPutCluster = findBestGEXCluster(levels, 'put');

        // Choose the largest cluster overall
        let largestWall = null;

        if (bestCallCluster && bestPutCluster) {
            if (bestCallCluster.totalGEX > bestPutCluster.totalGEX) {
                largestWall = {
                    strike: bestCallCluster.centralStrike,
                    gex: bestCallCluster.totalGEX / 1e9, // Convert to billions
                    type: 'call' as const,
                    cluster: bestCallCluster
                };
            } else {
                largestWall = {
                    strike: bestPutCluster.centralStrike,
                    gex: bestPutCluster.totalGEX / 1e9, // Convert to billions 
                    type: 'put' as const,
                    cluster: bestPutCluster
                };
            }
        } else if (bestCallCluster) {
            largestWall = {
                strike: bestCallCluster.centralStrike,
                gex: bestCallCluster.totalGEX / 1e9,
                type: 'call' as const,
                cluster: bestCallCluster
            };
        } else if (bestPutCluster) {
            largestWall = {
                strike: bestPutCluster.centralStrike,
                gex: bestPutCluster.totalGEX / 1e9,
                type: 'put' as const,
                cluster: bestPutCluster
            };
        }

        // Calculate pressure (distance to wall) - closer to wall = higher pressure
        let wallWithPressure = null;
        if (largestWall) {
            const distanceToWall = Math.abs(currentPrice - largestWall.strike);
            const priceRange = currentPrice * 0.2; // 20% of current price as max range
            const pressureScore = Math.max(1, Math.min(100, 100 - (distanceToWall / priceRange * 100)));

            wallWithPressure = {
                ...largestWall,
                pressure: Math.round(pressureScore)
            };
        }

        return {
            ticker: symbol,
            attractionLevel,
            dealerSweat,
            currentPrice,
            netGex: netGexBillions,
            marketCap,
            gexImpactScore,
            largestWall: wallWithPressure || undefined
        };

    } catch (error) {
        console.error(`Error calculating GEX for ${symbol}:`, error);
        return null;
    }
}

// ⚡ OPTIMIZED: Process symbols in parallel batches with HIGH concurrency
async function processBatchParallel(symbols: string[], baseUrl: string, expirationFilter: string = 'Default', maxConcurrency: number = 30): Promise<GEXData[]> {
    const results: GEXData[] = [];

    // Process in chunks of maxConcurrency (default 30 for maximum speed)
    for (let i = 0; i < symbols.length; i += maxConcurrency) {
        const batch = symbols.slice(i, i + maxConcurrency);
        const batchStartTime = Date.now();

        const batchPromises = batch.map(symbol => calculateSymbolGEX(symbol, baseUrl, expirationFilter));

        const batchResults = await Promise.allSettled(batchPromises);

        const validResults = batchResults
            .filter((result): result is PromiseFulfilledResult<GEXData> =>
                result.status === 'fulfilled' && result.value !== null
            )
            .map(result => result.value);

        results.push(...validResults);

        const batchTime = Date.now() - batchStartTime;
        console.log(`⚡ Parallel batch ${Math.floor(i / maxConcurrency) + 1}: Processed ${batch.length} symbols in ${batchTime}ms (${i + batch.length}/${symbols.length})`);

        // Minimal delay between batches - just enough to avoid API throttling
        if (i + maxConcurrency < symbols.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    return results;
}

// Legacy function for backward compatibility
async function processBatch(symbols: string[], baseUrl: string, expirationFilter: string = 'Default'): Promise<GEXData[]> {
    return processBatchParallel(symbols, baseUrl, expirationFilter, 15);
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 1000);
        const streaming = searchParams.get('stream') === 'true';
        const expirationFilter = searchParams.get('expirationFilter') || 'Default';
        const symbolsParam = searchParams.get('symbols');

        // Determine which symbols to process
        let symbolsToProcess: string[];
        if (symbolsParam) {
            // Custom symbols provided (comma-separated or single)
            symbolsToProcess = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
            console.log(`🎯 Custom symbols scan requested: ${symbolsToProcess.join(', ')}`);
        } else {
            // Use default top symbols
            symbolsToProcess = TOP_SCREENER_SYMBOLS.slice(0, Math.min(limit, 1000));
        }

        // If not streaming, use optimized parallel batch processing with MAXIMUM SPEED
        if (!streaming) {
            // Get base URL for internal API calls
            const host = request.nextUrl.host;
            const protocol = request.nextUrl.protocol;
            const baseUrl = `${protocol}//${host}`;

            // Process all symbols with HIGH concurrency for non-streaming (50 parallel requests!)
            console.log(`⚡ Processing ${symbolsToProcess.length} symbols with 50 parallel requests for ${expirationFilter} filter`);

            const startTime = Date.now();
            const allResults = await processBatchParallel(symbolsToProcess, baseUrl, expirationFilter, 50); // MAX SPEED: 50 concurrent
            const processingTime = Date.now() - startTime;

            console.log(`✅ Processed ${symbolsToProcess.length} symbols in ${processingTime}ms (${Math.round(symbolsToProcess.length / (processingTime / 1000))} symbols/sec)`);

            // Sort by GEX Impact Score (highest impact relative to market cap first)
            const sortedResults = allResults
                .filter(result => result.dealerSweat !== 0)
                .sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0));

            return NextResponse.json({
                success: true,
                data: sortedResults,
                timestamp: new Date().toISOString(),
                count: sortedResults.length,
                processingTimeMs: processingTime,
                symbolsProcessed: symbolsToProcess.length,
                expirationFilter
            });
        }

        // Streaming response with PARALLEL BATCH PROCESSING for speed
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Get base URL for internal API calls
                    const host = request.nextUrl.host;
                    const protocol = request.nextUrl.protocol;
                    const baseUrl = `${protocol}//${host}`;

                    const allResults: GEXData[] = [];

                    // Send initial message
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'start',
                        total: symbolsToProcess.length,
                        timestamp: new Date().toISOString()
                    })}\n\n`));

                    // ⚡ PARALLEL BATCH PROCESSING - Process 10 symbols at once (reduced from 25 for stability)
                    const BATCH_SIZE = 10; // Smaller batches = less wait time if one symbol is slow
                    const BATCH_DELAY = 50; // Reduced delay between batches
                    const SYMBOL_TIMEOUT = 12000; // 12 second timeout per symbol (prevent stalls)

                    for (let i = 0; i < symbolsToProcess.length; i += BATCH_SIZE) {
                        const batch = symbolsToProcess.slice(i, i + BATCH_SIZE);
                        const batchStartTime = Date.now();

                        // Process entire batch in parallel with Promise.allSettled
                        const batchPromises = batch.map(symbol =>
                            // Wrap in timeout promise to prevent individual symbols from blocking
                            Promise.race([
                                calculateSymbolGEX(symbol, baseUrl, expirationFilter),
                                new Promise<null>((resolve) =>
                                    setTimeout(() => {
                                        console.log(`⏱️ ${symbol}: Skipping due to timeout`);
                                        resolve(null);
                                    }, SYMBOL_TIMEOUT)
                                )
                            ]).catch(error => {
                                console.error(`❌ Error processing ${symbol}:`, error);
                                return null;
                            })
                        );

                        const batchResults = await Promise.allSettled(batchPromises);

                        // Extract successful results and send updates
                        batchResults.forEach((result, batchIdx) => {
                            if (result.status === 'fulfilled' && result.value && result.value.dealerSweat !== 0) {
                                allResults.push(result.value);

                                // Send individual result
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                    type: 'result',
                                    data: result.value,
                                    progress: i + batchIdx + 1,
                                    total: symbolsToProcess.length,
                                    timestamp: new Date().toISOString()
                                })}\n\n`));
                            }
                        });

                        const batchTime = Date.now() - batchStartTime;
                        const successCount = batchResults.filter(r => r.status === 'fulfilled' && r.value).length;
                        console.log(`⚡ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Processed ${batch.length} symbols in ${batchTime}ms (${successCount} successful) - Progress: ${i + batch.length}/${symbolsToProcess.length}`);

                        // Small delay between batches to avoid overwhelming the API
                        if (i + BATCH_SIZE < symbolsToProcess.length) {
                            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                        }
                    }

                    // Send final sorted results by GEX Impact Score
                    const sortedResults = allResults
                        .sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0));

                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'complete',
                        data: sortedResults,
                        count: sortedResults.length,
                        timestamp: new Date().toISOString()
                    })}\n\n`));

                    console.log(`✅ GEX Screener complete: ${sortedResults.length} results from ${symbolsToProcess.length} symbols`);
                    controller.close();
                } catch (error) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: new Date().toISOString()
                    })}\n\n`));
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (error) {
        console.error('GEX Screener API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch GEX screener data',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { symbols } = body;

        if (!symbols || !Array.isArray(symbols)) {
            return NextResponse.json(
                { success: false, error: 'Invalid symbols array' },
                { status: 400 }
            );
        }

        // Get base URL for internal API calls
        const host = request.nextUrl.host;
        const protocol = request.nextUrl.protocol;
        const baseUrl = `${protocol}//${host}`;

        const batchSize = 5;
        const batches = [];

        for (let i = 0; i < symbols.length; i += batchSize) {
            batches.push(symbols.slice(i, i + batchSize));
        }

        const allResults: GEXData[] = [];

        for (let i = 0; i < batches.length; i++) {
            const batchResults = await processBatch(batches[i], baseUrl);
            allResults.push(...batchResults);

            if (i < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        const sortedResults = allResults
            .filter(result => result.dealerSweat !== 0)
            .sort((a, b) => Math.abs(b.dealerSweat) - Math.abs(a.dealerSweat));

        return NextResponse.json({
            success: true,
            data: sortedResults,
            timestamp: new Date().toISOString(),
            count: sortedResults.length
        });

    } catch (error) {
        console.error('GEX Screener POST API Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to process custom symbols',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}