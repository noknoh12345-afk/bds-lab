// GeoUI timeline: plays the pack's sequences for each player (GeoUI Builder's timeline; bds-lab bds/geoui/timeline).
// /scriptevent geoui:play <sequence number or id> [from seconds] · geoui:stop · geoui:pause · geoui:resume
// geoui:seek <seconds> · geoui:offset <ms> (presses judged that much later: the lag of a device)
// A game (osu!): geoui:mode auto | aim | relax (it plays itself / the cursor where you look / any press on time) · geoui:sens <units a degree>
// · geoui:mods HD FL NF SD PF | none · geoui:retry · geoui:tour (every look in about 20 s) · geoui:menu (or /geoui:osu)
// Presses: jump or sneak, or using an item. Score, combo, accuracy (x100) and health go to geoui:v0 … v3.
// Markers with an event send /scriptevent geoui:marker <sequence>:<marker> <event>. Audio clips play when the time
// reaches them and stop at a pause, a seek or a stop (a sound already past at a seek or a resume stays silent).
import { world, system, ButtonState, InputButton } from '@minecraft/server';

const CFG = {"ns":"geoui","windows":{"great":32,"good":76,"ok":120},"margin":250,"missDrain":8,"hitGain":2,"mode":"aim","sens":2.4,"field":[90,68],"global":{"events":[],"groups":[],"specs":{}},"values":{"score":"v0","combo":"v1","accuracy":"v2","health":"v3"},"sequences":[{"index":1,"id":"osu","duration":114011,"loop":"once","inOut":null,"markers":[[113011,"end","done"]],"templates":[{"tag":"t0s","mode":"baked","lead":600,"slots":8,"events":true,"items":[[1000,0,0,1620,"o1",400,"osu-circle/o1"],[1167,1,0,1787,"o2",567,"osu-circle/o2"],[1333,2,0,1953,"o3",733,"osu-circle/o3"],[1500,3,0,2120,"o4",900,"osu-circle/o4"],[1667,4,0,2287,"o5",1067,"osu-circle/o5"],[2393,0,0,3013,"o7",1793,"osu-circle/o7"],[2559,1,0,3179,"o8",1959,"osu-circle/o8"],[4928,0,0,5548,"o13",4328,"osu-circle/o13"],[5094,1,0,5714,"o14",4494,"osu-circle/o14"],[5261,2,0,5881,"o15",4661,"osu-circle/o15"],[6169,0,0,6789,"o17",5569,"osu-circle/o17"],[6335,1,0,6955,"o18",5735,"osu-circle/o18"],[6502,2,0,7122,"o19",5902,"osu-circle/o19"],[6669,3,0,7289,"o20",6069,"osu-circle/o20"],[6835,4,0,7455,"o21",6235,"osu-circle/o21"],[7957,0,0,8577,"o23",7357,"osu-circle/o23"],[8124,1,0,8744,"o24",7524,"osu-circle/o24"],[8291,2,0,8911,"o25",7691,"osu-circle/o25"],[8926,3,0,9546,"o27",8326,"osu-circle/o27"],[9093,4,0,9713,"o28",8493,"osu-circle/o28"],[10963,0,0,11583,"o32",10363,"osu-circle/o32"],[11130,1,0,11750,"o33",10530,"osu-circle/o33"],[12267,0,0,12887,"o35",11667,"osu-circle/o35"],[12433,1,0,13053,"o36",11833,"osu-circle/o36"],[12600,2,0,13220,"o37",12000,"osu-circle/o37"],[12767,3,0,13387,"o38",12167,"osu-circle/o38"],[12933,4,0,13553,"o39",12333,"osu-circle/o39"],[13778,0,0,14398,"o41",13178,"osu-circle/o41"],[14378,1,0,14998,"o43",13778,"osu-circle/o43"],[15102,0,0,15722,"o45",14502,"osu-circle/o45"],[15269,2,0,15889,"o46",14669,"osu-circle/o46"],[15891,1,0,16511,"o48",15291,"osu-circle/o48"],[16057,3,0,16677,"o49",15457,"osu-circle/o49"],[16224,4,0,16844,"o50",15624,"osu-circle/o50"],[18130,0,0,18750,"o54",17530,"osu-circle/o54"],[19193,1,0,19813,"o56",18593,"osu-circle/o56"],[19359,0,0,19979,"o57",18759,"osu-circle/o57"],[19526,2,0,20146,"o58",18926,"osu-circle/o58"],[22104,0,0,22724,"o61",21504,"osu-circle/o61"],[22665,1,0,23285,"o63",22065,"osu-circle/o63"],[24831,0,0,25451,"o65",24231,"osu-circle/o65"],[24998,1,0,25618,"o66",24398,"osu-circle/o66"],[25165,2,0,25785,"o67",24565,"osu-circle/o67"],[26385,0,0,27005,"o70",25785,"osu-circle/o70"],[27528,1,0,28148,"o73",26928,"osu-circle/o73"],[31111,0,0,31731,"o77",30511,"osu-circle/o77"],[31278,1,0,31898,"o78",30678,"osu-circle/o78"],[33841,0,0,34461,"o81",33241,"osu-circle/o81"],[34007,1,0,34627,"o82",33407,"osu-circle/o82"],[34735,2,0,35355,"o84",34135,"osu-circle/o84"],[34902,3,0,35522,"o85",34302,"osu-circle/o85"],[35068,0,0,35688,"o86",34468,"osu-circle/o86"],[35235,1,0,35855,"o87",34635,"osu-circle/o87"],[39754,0,0,40374,"o93",39154,"osu-circle/o93"],[40787,1,0,41407,"o95",40187,"osu-circle/o95"],[41517,0,0,42137,"o97",40917,"osu-circle/o97"],[41683,2,0,42303,"o98",41083,"osu-circle/o98"],[42298,1,0,42918,"o100",41698,"osu-circle/o100"],[44465,0,0,45085,"o102",43865,"osu-circle/o102"],[44631,1,0,45251,"o103",44031,"osu-circle/o103"],[44798,2,0,45418,"o104",44198,"osu-circle/o104"],[46250,0,0,46870,"o107",45650,"osu-circle/o107"],[46417,1,0,47037,"o108",45817,"osu-circle/o108"],[46583,2,0,47203,"o109",45983,"osu-circle/o109"],[47163,3,0,47783,"o111",46563,"osu-circle/o111"],[47330,4,0,47950,"o112",46730,"osu-circle/o112"],[47496,0,0,48116,"o113",46896,"osu-circle/o113"],[48828,0,0,49448,"o116",48228,"osu-circle/o116"],[48994,1,0,49614,"o117",48394,"osu-circle/o117"],[49161,2,0,49781,"o118",48561,"osu-circle/o118"],[49728,3,0,50348,"o120",49128,"osu-circle/o120"],[49894,4,0,50514,"o121",49294,"osu-circle/o121"],[50554,0,0,51174,"o123",49954,"osu-circle/o123"],[50720,1,0,51340,"o124",50120,"osu-circle/o124"],[50887,2,0,51507,"o125",50287,"osu-circle/o125"],[51054,3,0,51674,"o126",50454,"osu-circle/o126"],[53220,0,0,53840,"o128",52620,"osu-circle/o128"],[53387,1,0,54007,"o129",52787,"osu-circle/o129"],[53554,2,0,54174,"o130",52954,"osu-circle/o130"],[55368,0,0,55988,"o134",54768,"osu-circle/o134"],[56874,0,0,57494,"o137",56274,"osu-circle/o137"],[57041,1,0,57661,"o138",56441,"osu-circle/o138"],[57207,2,0,57827,"o139",56607,"osu-circle/o139"],[57374,3,0,57994,"o140",56774,"osu-circle/o140"],[57541,4,0,58161,"o141",56941,"osu-circle/o141"],[57707,5,0,58327,"o142",57107,"osu-circle/o142"],[58318,0,0,58938,"o144",57718,"osu-circle/o144"],[58485,1,0,59105,"o145",57885,"osu-circle/o145"],[58652,2,0,59272,"o146",58052,"osu-circle/o146"],[59389,3,0,60009,"o148",58789,"osu-circle/o148"],[60072,0,0,60692,"o150",59472,"osu-circle/o150"],[60239,1,0,60859,"o151",59639,"osu-circle/o151"],[60959,2,0,61579,"o153",60359,"osu-circle/o153"],[61944,0,0,62564,"o155",61344,"osu-circle/o155"],[65196,0,0,65816,"o159",64596,"osu-circle/o159"],[65363,1,0,65983,"o160",64763,"osu-circle/o160"],[65974,2,0,66594,"o162",65374,"osu-circle/o162"],[66874,0,0,67494,"o164",66274,"osu-circle/o164"],[67041,1,0,67661,"o165",66441,"osu-circle/o165"],[67207,2,0,67827,"o166",66607,"osu-circle/o166"],[67374,3,0,67994,"o167",66774,"osu-circle/o167"],[67541,4,0,68161,"o168",66941,"osu-circle/o168"],[68485,0,0,69105,"o170",67885,"osu-circle/o170"],[68652,1,0,69272,"o171",68052,"osu-circle/o171"],[68818,2,0,69438,"o172",68218,"osu-circle/o172"],[69487,3,0,70107,"o174",68887,"osu-circle/o174"],[70985,0,0,71605,"o177",70385,"osu-circle/o177"],[72704,0,0,73324,"o181",72104,"osu-circle/o181"],[72870,1,0,73490,"o182",72270,"osu-circle/o182"],[73037,2,0,73657,"o183",72437,"osu-circle/o183"],[73204,3,0,73824,"o184",72604,"osu-circle/o184"],[73370,4,0,73990,"o185",72770,"osu-circle/o185"],[73537,5,0,74157,"o186",72937,"osu-circle/o186"],[73704,6,0,74324,"o187",73104,"osu-circle/o187"],[74805,0,0,75425,"o190",74205,"osu-circle/o190"],[74972,1,0,75592,"o191",74372,"osu-circle/o191"],[76228,0,0,76848,"o194",75628,"osu-circle/o194"],[76909,1,0,77529,"o196",76309,"osu-circle/o196"],[77076,2,0,77696,"o197",76476,"osu-circle/o197"],[77243,3,0,77863,"o198",76643,"osu-circle/o198"],[77409,4,0,78029,"o199",76809,"osu-circle/o199"],[77576,0,0,78196,"o200",76976,"osu-circle/o200"],[77743,5,0,78363,"o201",77143,"osu-circle/o201"],[78668,1,0,79288,"o203",78068,"osu-circle/o203"],[78835,0,0,79455,"o204",78235,"osu-circle/o204"],[79002,2,0,79622,"o205",78402,"osu-circle/o205"],[79168,3,0,79788,"o206",78568,"osu-circle/o206"],[79335,4,0,79955,"o207",78735,"osu-circle/o207"],[80909,0,0,81529,"o210",80309,"osu-circle/o210"],[82020,1,0,82640,"o212",81420,"osu-circle/o212"],[82600,0,0,83220,"o214",82000,"osu-circle/o214"],[82767,2,0,83387,"o215",82167,"osu-circle/o215"],[83394,1,0,84014,"o217",82794,"osu-circle/o217"],[83561,3,0,84181,"o218",82961,"osu-circle/o218"],[83728,4,0,84348,"o219",83128,"osu-circle/o219"],[84978,0,0,85598,"o222",84378,"osu-circle/o222"],[85896,1,0,86516,"o224",85296,"osu-circle/o224"],[86063,2,0,86683,"o225",85463,"osu-circle/o225"],[86230,0,0,86850,"o226",85630,"osu-circle/o226"],[86396,3,0,87016,"o227",85796,"osu-circle/o227"],[87117,1,0,87737,"o229",86517,"osu-circle/o229"],[87283,2,0,87903,"o230",86683,"osu-circle/o230"],[87998,0,0,88618,"o232",87398,"osu-circle/o232"],[88165,3,0,88785,"o233",87565,"osu-circle/o233"],[89755,0,0,90375,"o236",89155,"osu-circle/o236"],[90381,1,0,91001,"o238",89781,"osu-circle/o238"],[90548,2,0,91168,"o239",89948,"osu-circle/o239"],[90715,3,0,91335,"o240",90115,"osu-circle/o240"],[90881,4,0,91501,"o241",90281,"osu-circle/o241"],[91048,0,0,91668,"o242",90448,"osu-circle/o242"],[91215,5,0,91835,"o243",90615,"osu-circle/o243"],[92530,0,0,93150,"o246",91930,"osu-circle/o246"],[93637,1,0,94257,"o248",93037,"osu-circle/o248"],[95511,0,0,96131,"o252",94911,"osu-circle/o252"],[97400,0,0,98020,"o256",96800,"osu-circle/o256"],[97567,1,0,98187,"o257",96967,"osu-circle/o257"],[97733,2,0,98353,"o258",97133,"osu-circle/o258"],[97900,3,0,98520,"o259",97300,"osu-circle/o259"],[98067,4,0,98687,"o260",97467,"osu-circle/o260"],[98754,0,0,99374,"o262",98154,"osu-circle/o262"],[101444,0,0,102064,"o265",100844,"osu-circle/o265"],[101611,1,0,102231,"o266",101011,"osu-circle/o266"],[101778,2,0,102398,"o267",101178,"osu-circle/o267"],[101944,3,0,102564,"o268",101344,"osu-circle/o268"],[102111,4,0,102731,"o269",101511,"osu-circle/o269"],[102831,0,0,103451,"o271",102231,"osu-circle/o271"],[103405,1,0,104025,"o273",102805,"osu-circle/o273"],[103572,2,0,104192,"o274",102972,"osu-circle/o274"],[103739,3,0,104359,"o275",103139,"osu-circle/o275"],[105905,0,0,106525,"o277",105305,"osu-circle/o277"],[106543,1,0,107163,"o279",105943,"osu-circle/o279"],[106709,2,0,107329,"o280",106109,"osu-circle/o280"],[106876,3,0,107496,"o281",106276,"osu-circle/o281"],[107043,4,0,107663,"o282",106443,"osu-circle/o282"],[107209,0,0,107829,"o283",106609,"osu-circle/o283"],[107376,5,0,107996,"o284",106776,"osu-circle/o284"],[107543,6,0,108163,"o285",106943,"osu-circle/o285"],[107709,7,0,108329,"o286",107109,"osu-circle/o286"],[107876,1,0,108496,"o287",107276,"osu-circle/o287"],[109491,0,0,110111,"o290",108891,"osu-circle/o290"],[110218,1,0,110838,"o292",109618,"osu-circle/o292"],[110385,2,0,111005,"o293",109785,"osu-circle/o293"],[111067,0,0,111687,"o295",110467,"osu-circle/o295"],[111233,3,0,111853,"o296",110633,"osu-circle/o296"],[112678,0,0,113298,"o299",112078,"osu-circle/o299"],[112844,1,0,113464,"o300",112244,"osu-circle/o300"]]},{"tag":"t1s","mode":"baked","lead":600,"slots":3,"events":true,"items":[[1833,0,0,2726,"o6",1233,"osu-slider/o6"],[2726,1,0,3476,"o9",2126,"osu-slider/o9"],[3143,2,0,4406,"o10",2543,"osu-slider/o10"],[4072,0,0,4802,"o11",3472,"osu-slider/o11"],[4469,1,0,5262,"o12",3869,"osu-slider/o12"],[5428,0,0,6502,"o16",4828,"osu-slider/o16"],[7002,1,0,8291,"o22",6402,"osu-slider/o22"],[8457,0,0,9259,"o26",7857,"osu-slider/o26"],[9259,1,0,10109,"o29",8659,"osu-slider/o29"],[9776,2,0,10552,"o30",9176,"osu-slider/o30"],[10219,0,0,11297,"o31",9619,"osu-slider/o31"],[11296,1,0,12600,"o34",10696,"osu-slider/o34"],[13100,0,0,14111,"o40",12500,"osu-slider/o40"],[13944,1,0,14711,"o42",13344,"osu-slider/o42"],[14544,2,0,15435,"o44",13944,"osu-slider/o44"],[15435,0,0,16224,"o47",14835,"osu-slider/o47"],[16391,1,0,17256,"o51",15791,"osu-slider/o51"],[16922,0,0,18044,"o52",16322,"osu-slider/o52"],[17711,2,0,18463,"o53",17111,"osu-slider/o53"],[18296,1,0,19526,"o55",17696,"osu-slider/o55"],[19693,0,0,20437,"o59",19093,"osu-slider/o59"],[22270,0,0,22998,"o62",21670,"osu-slider/o62"],[25331,0,0,26192,"o68",24731,"osu-slider/o68"],[25859,1,0,26718,"o69",25259,"osu-slider/o69"],[26552,2,0,27378,"o71",25952,"osu-slider/o71"],[27044,0,0,27861,"o72",26444,"osu-slider/o72"],[29694,0,0,30477,"o75",29094,"osu-slider/o75"],[30144,1,0,31444,"o76",29544,"osu-slider/o76"],[33444,0,0,34174,"o80",32844,"osu-slider/o80"],[34174,1,0,35068,"o83",33574,"osu-slider/o83"],[37402,0,0,38296,"o89",36802,"osu-slider/o89"],[37963,1,0,38702,"o90",37363,"osu-slider/o90"],[38368,2,0,39553,"o91",37768,"osu-slider/o91"],[39220,0,0,40087,"o92",38620,"osu-slider/o92"],[39920,1,0,41120,"o94",39320,"osu-slider/o94"],[40954,0,0,41850,"o96",40354,"osu-slider/o96"],[41850,1,0,42632,"o99",41250,"osu-slider/o99"],[44965,0,0,45872,"o105",44365,"osu-slider/o105"],[45539,1,0,46583,"o106",44939,"osu-slider/o106"],[46750,0,0,47496,"o110",46150,"osu-slider/o110"],[47663,1,0,48480,"o114",47063,"osu-slider/o114"],[48146,0,0,49161,"o115",47546,"osu-slider/o115"],[49328,1,0,50061,"o119",48728,"osu-slider/o119"],[50061,0,0,50887,"o122",49461,"osu-slider/o122"],[53720,0,0,54566,"o131",53120,"osu-slider/o131"],[54233,1,0,54983,"o132",53633,"osu-slider/o132"],[54650,2,0,55702,"o133",54050,"osu-slider/o133"],[55535,0,0,56422,"o135",54935,"osu-slider/o135"],[56089,1,0,57207,"o136",55489,"osu-slider/o136"],[57874,0,0,58652,"o143",57274,"osu-slider/o143"],[58818,1,0,59722,"o147",58218,"osu-slider/o147"],[59556,0,0,60406,"o149",58956,"osu-slider/o149"],[60406,1,0,61293,"o152",59806,"osu-slider/o152"],[61126,0,0,62278,"o154",60526,"osu-slider/o154"],[64111,0,0,65067,"o157",63511,"osu-slider/o157"],[64733,1,0,65529,"o158",64133,"osu-slider/o158"],[65530,2,0,66308,"o161",64930,"osu-slider/o161"],[66141,0,0,67208,"o163",65541,"osu-slider/o163"],[67707,1,0,68818,"o169",67107,"osu-slider/o169"],[68985,0,0,69820,"o173",68385,"osu-slider/o173"],[69654,1,0,70850,"o175",69054,"osu-slider/o175"],[70517,0,0,71319,"o176",69917,"osu-slider/o176"],[71152,2,0,72211,"o178",70552,"osu-slider/o178"],[71878,1,0,72648,"o179",71278,"osu-slider/o179"],[72315,0,0,73037,"o180",71715,"osu-slider/o180"],[73870,0,0,74631,"o188",73270,"osu-slider/o188"],[74298,1,0,75139,"o189",73698,"osu-slider/o189"],[75139,2,0,75932,"o192",74539,"osu-slider/o192"],[75598,0,0,76561,"o193",74998,"osu-slider/o193"],[76394,1,0,77242,"o195",75794,"osu-slider/o195"],[77909,0,0,79002,"o202",77309,"osu-slider/o202"],[79502,1,0,80765,"o208",78902,"osu-slider/o208"],[80431,0,0,81242,"o209",79831,"osu-slider/o209"],[81076,2,0,82354,"o211",80476,"osu-slider/o211"],[82187,0,0,82933,"o213",81587,"osu-slider/o213"],[82933,1,0,83727,"o216",82333,"osu-slider/o216"],[83894,0,0,84876,"o220",83294,"osu-slider/o220"],[84543,1,0,85312,"o221",83943,"osu-slider/o221"],[85144,2,0,86229,"o223",84544,"osu-slider/o223"],[86563,0,0,87450,"o228",85963,"osu-slider/o228"],[87450,1,0,88332,"o231",86850,"osu-slider/o231"],[88331,0,0,89166,"o234",87731,"osu-slider/o234"],[88833,2,0,90089,"o235",88233,"osu-slider/o235"],[89922,0,0,90715,"o237",89322,"osu-slider/o237"],[91381,0,0,92407,"o244",90781,"osu-slider/o244"],[92074,1,0,92863,"o245",91474,"osu-slider/o245"],[92696,2,0,93970,"o247",92096,"osu-slider/o247"],[93804,0,0,94661,"o249",93204,"osu-slider/o249"],[94328,1,0,95347,"o250",93728,"osu-slider/o250"],[95013,2,0,95845,"o251",94413,"osu-slider/o251"],[95678,0,0,96767,"o253",95078,"osu-slider/o253"],[96433,1,0,97253,"o254",95833,"osu-slider/o254"],[96920,2,0,97733,"o255",96320,"osu-slider/o255"],[98233,0,0,99087,"o261",97633,"osu-slider/o261"],[100920,0,0,101777,"o264",100320,"osu-slider/o264"],[102278,1,0,103165,"o270",101678,"osu-slider/o270"],[102998,0,0,103739,"o272",102398,"osu-slider/o272"],[106072,0,0,106876,"o278",105472,"osu-slider/o278"],[108043,0,0,108913,"o288",107443,"osu-slider/o288"],[108580,1,0,109824,"o289",107980,"osu-slider/o289"],[109657,0,0,110551,"o291",109057,"osu-slider/o291"],[110552,1,0,111400,"o294",109952,"osu-slider/o294"],[111400,0,0,112193,"o297",110800,"osu-slider/o297"],[111859,2,0,113011,"o298",111259,"osu-slider/o298"]]},{"tag":"t2s","mode":"baked","lead":300,"slots":1,"events":false,"items":[[20104,0,0,21904,"o60",19804,"osu-spinner/o60"],[22831,0,0,24631,"o64",22531,"osu-spinner/o64"],[27694,0,0,29494,"o74",27394,"osu-spinner/o74"],[31444,0,0,33244,"o79",31144,"osu-spinner/o79"],[35402,0,0,37202,"o88",35102,"osu-spinner/o88"],[42465,0,0,44265,"o101",42165,"osu-spinner/o101"],[51220,0,0,53020,"o127",50920,"osu-spinner/o127"],[62111,0,0,63911,"o156",61811,"osu-spinner/o156"],[98920,0,0,100720,"o263",98620,"osu-spinner/o263"],[103905,0,0,105705,"o276",103605,"osu-spinner/o276"]]}],"hits":[[1000,"t0s",0,"o1","osu-circle/o1"],[1167,"t0s",1,"o2","osu-circle/o2"],[1333,"t0s",2,"o3","osu-circle/o3"],[1500,"t0s",3,"o4","osu-circle/o4"],[1667,"t0s",4,"o5","osu-circle/o5"],[1833,"t1s",0,"o6","osu-slider/o6"],[2393,"t0s",0,"o7","osu-circle/o7"],[2559,"t0s",1,"o8","osu-circle/o8"],[2726,"t1s",1,"o9","osu-slider/o9"],[3143,"t1s",2,"o10","osu-slider/o10"],[4072,"t1s",0,"o11","osu-slider/o11"],[4469,"t1s",1,"o12","osu-slider/o12"],[4928,"t0s",0,"o13","osu-circle/o13"],[5094,"t0s",1,"o14","osu-circle/o14"],[5261,"t0s",2,"o15","osu-circle/o15"],[5428,"t1s",0,"o16","osu-slider/o16"],[6169,"t0s",0,"o17","osu-circle/o17"],[6335,"t0s",1,"o18","osu-circle/o18"],[6502,"t0s",2,"o19","osu-circle/o19"],[6669,"t0s",3,"o20","osu-circle/o20"],[6835,"t0s",4,"o21","osu-circle/o21"],[7002,"t1s",1,"o22","osu-slider/o22"],[7957,"t0s",0,"o23","osu-circle/o23"],[8124,"t0s",1,"o24","osu-circle/o24"],[8291,"t0s",2,"o25","osu-circle/o25"],[8457,"t1s",0,"o26","osu-slider/o26"],[8926,"t0s",3,"o27","osu-circle/o27"],[9093,"t0s",4,"o28","osu-circle/o28"],[9259,"t1s",1,"o29","osu-slider/o29"],[9776,"t1s",2,"o30","osu-slider/o30"],[10219,"t1s",0,"o31","osu-slider/o31"],[10963,"t0s",0,"o32","osu-circle/o32"],[11130,"t0s",1,"o33","osu-circle/o33"],[11296,"t1s",1,"o34","osu-slider/o34"],[12267,"t0s",0,"o35","osu-circle/o35"],[12433,"t0s",1,"o36","osu-circle/o36"],[12600,"t0s",2,"o37","osu-circle/o37"],[12767,"t0s",3,"o38","osu-circle/o38"],[12933,"t0s",4,"o39","osu-circle/o39"],[13100,"t1s",0,"o40","osu-slider/o40"],[13778,"t0s",0,"o41","osu-circle/o41"],[13944,"t1s",1,"o42","osu-slider/o42"],[14378,"t0s",1,"o43","osu-circle/o43"],[14544,"t1s",2,"o44","osu-slider/o44"],[15102,"t0s",0,"o45","osu-circle/o45"],[15269,"t0s",2,"o46","osu-circle/o46"],[15435,"t1s",0,"o47","osu-slider/o47"],[15891,"t0s",1,"o48","osu-circle/o48"],[16057,"t0s",3,"o49","osu-circle/o49"],[16224,"t0s",4,"o50","osu-circle/o50"],[16391,"t1s",1,"o51","osu-slider/o51"],[16922,"t1s",0,"o52","osu-slider/o52"],[17711,"t1s",2,"o53","osu-slider/o53"],[18130,"t0s",0,"o54","osu-circle/o54"],[18296,"t1s",1,"o55","osu-slider/o55"],[19193,"t0s",1,"o56","osu-circle/o56"],[19359,"t0s",0,"o57","osu-circle/o57"],[19526,"t0s",2,"o58","osu-circle/o58"],[19693,"t1s",0,"o59","osu-slider/o59"],[22104,"t0s",0,"o61","osu-circle/o61"],[22270,"t1s",0,"o62","osu-slider/o62"],[22665,"t0s",1,"o63","osu-circle/o63"],[24831,"t0s",0,"o65","osu-circle/o65"],[24998,"t0s",1,"o66","osu-circle/o66"],[25165,"t0s",2,"o67","osu-circle/o67"],[25331,"t1s",0,"o68","osu-slider/o68"],[25859,"t1s",1,"o69","osu-slider/o69"],[26385,"t0s",0,"o70","osu-circle/o70"],[26552,"t1s",2,"o71","osu-slider/o71"],[27044,"t1s",0,"o72","osu-slider/o72"],[27528,"t0s",1,"o73","osu-circle/o73"],[29694,"t1s",0,"o75","osu-slider/o75"],[30144,"t1s",1,"o76","osu-slider/o76"],[31111,"t0s",0,"o77","osu-circle/o77"],[31278,"t0s",1,"o78","osu-circle/o78"],[33444,"t1s",0,"o80","osu-slider/o80"],[33841,"t0s",0,"o81","osu-circle/o81"],[34007,"t0s",1,"o82","osu-circle/o82"],[34174,"t1s",1,"o83","osu-slider/o83"],[34735,"t0s",2,"o84","osu-circle/o84"],[34902,"t0s",3,"o85","osu-circle/o85"],[35068,"t0s",0,"o86","osu-circle/o86"],[35235,"t0s",1,"o87","osu-circle/o87"],[37402,"t1s",0,"o89","osu-slider/o89"],[37963,"t1s",1,"o90","osu-slider/o90"],[38368,"t1s",2,"o91","osu-slider/o91"],[39220,"t1s",0,"o92","osu-slider/o92"],[39754,"t0s",0,"o93","osu-circle/o93"],[39920,"t1s",1,"o94","osu-slider/o94"],[40787,"t0s",1,"o95","osu-circle/o95"],[40954,"t1s",0,"o96","osu-slider/o96"],[41517,"t0s",0,"o97","osu-circle/o97"],[41683,"t0s",2,"o98","osu-circle/o98"],[41850,"t1s",1,"o99","osu-slider/o99"],[42298,"t0s",1,"o100","osu-circle/o100"],[44465,"t0s",0,"o102","osu-circle/o102"],[44631,"t0s",1,"o103","osu-circle/o103"],[44798,"t0s",2,"o104","osu-circle/o104"],[44965,"t1s",0,"o105","osu-slider/o105"],[45539,"t1s",1,"o106","osu-slider/o106"],[46250,"t0s",0,"o107","osu-circle/o107"],[46417,"t0s",1,"o108","osu-circle/o108"],[46583,"t0s",2,"o109","osu-circle/o109"],[46750,"t1s",0,"o110","osu-slider/o110"],[47163,"t0s",3,"o111","osu-circle/o111"],[47330,"t0s",4,"o112","osu-circle/o112"],[47496,"t0s",0,"o113","osu-circle/o113"],[47663,"t1s",1,"o114","osu-slider/o114"],[48146,"t1s",0,"o115","osu-slider/o115"],[48828,"t0s",0,"o116","osu-circle/o116"],[48994,"t0s",1,"o117","osu-circle/o117"],[49161,"t0s",2,"o118","osu-circle/o118"],[49328,"t1s",1,"o119","osu-slider/o119"],[49728,"t0s",3,"o120","osu-circle/o120"],[49894,"t0s",4,"o121","osu-circle/o121"],[50061,"t1s",0,"o122","osu-slider/o122"],[50554,"t0s",0,"o123","osu-circle/o123"],[50720,"t0s",1,"o124","osu-circle/o124"],[50887,"t0s",2,"o125","osu-circle/o125"],[51054,"t0s",3,"o126","osu-circle/o126"],[53220,"t0s",0,"o128","osu-circle/o128"],[53387,"t0s",1,"o129","osu-circle/o129"],[53554,"t0s",2,"o130","osu-circle/o130"],[53720,"t1s",0,"o131","osu-slider/o131"],[54233,"t1s",1,"o132","osu-slider/o132"],[54650,"t1s",2,"o133","osu-slider/o133"],[55368,"t0s",0,"o134","osu-circle/o134"],[55535,"t1s",0,"o135","osu-slider/o135"],[56089,"t1s",1,"o136","osu-slider/o136"],[56874,"t0s",0,"o137","osu-circle/o137"],[57041,"t0s",1,"o138","osu-circle/o138"],[57207,"t0s",2,"o139","osu-circle/o139"],[57374,"t0s",3,"o140","osu-circle/o140"],[57541,"t0s",4,"o141","osu-circle/o141"],[57707,"t0s",5,"o142","osu-circle/o142"],[57874,"t1s",0,"o143","osu-slider/o143"],[58318,"t0s",0,"o144","osu-circle/o144"],[58485,"t0s",1,"o145","osu-circle/o145"],[58652,"t0s",2,"o146","osu-circle/o146"],[58818,"t1s",1,"o147","osu-slider/o147"],[59389,"t0s",3,"o148","osu-circle/o148"],[59556,"t1s",0,"o149","osu-slider/o149"],[60072,"t0s",0,"o150","osu-circle/o150"],[60239,"t0s",1,"o151","osu-circle/o151"],[60406,"t1s",1,"o152","osu-slider/o152"],[60959,"t0s",2,"o153","osu-circle/o153"],[61126,"t1s",0,"o154","osu-slider/o154"],[61944,"t0s",0,"o155","osu-circle/o155"],[64111,"t1s",0,"o157","osu-slider/o157"],[64733,"t1s",1,"o158","osu-slider/o158"],[65196,"t0s",0,"o159","osu-circle/o159"],[65363,"t0s",1,"o160","osu-circle/o160"],[65530,"t1s",2,"o161","osu-slider/o161"],[65974,"t0s",2,"o162","osu-circle/o162"],[66141,"t1s",0,"o163","osu-slider/o163"],[66874,"t0s",0,"o164","osu-circle/o164"],[67041,"t0s",1,"o165","osu-circle/o165"],[67207,"t0s",2,"o166","osu-circle/o166"],[67374,"t0s",3,"o167","osu-circle/o167"],[67541,"t0s",4,"o168","osu-circle/o168"],[67707,"t1s",1,"o169","osu-slider/o169"],[68485,"t0s",0,"o170","osu-circle/o170"],[68652,"t0s",1,"o171","osu-circle/o171"],[68818,"t0s",2,"o172","osu-circle/o172"],[68985,"t1s",0,"o173","osu-slider/o173"],[69487,"t0s",3,"o174","osu-circle/o174"],[69654,"t1s",1,"o175","osu-slider/o175"],[70517,"t1s",0,"o176","osu-slider/o176"],[70985,"t0s",0,"o177","osu-circle/o177"],[71152,"t1s",2,"o178","osu-slider/o178"],[71878,"t1s",1,"o179","osu-slider/o179"],[72315,"t1s",0,"o180","osu-slider/o180"],[72704,"t0s",0,"o181","osu-circle/o181"],[72870,"t0s",1,"o182","osu-circle/o182"],[73037,"t0s",2,"o183","osu-circle/o183"],[73204,"t0s",3,"o184","osu-circle/o184"],[73370,"t0s",4,"o185","osu-circle/o185"],[73537,"t0s",5,"o186","osu-circle/o186"],[73704,"t0s",6,"o187","osu-circle/o187"],[73870,"t1s",0,"o188","osu-slider/o188"],[74298,"t1s",1,"o189","osu-slider/o189"],[74805,"t0s",0,"o190","osu-circle/o190"],[74972,"t0s",1,"o191","osu-circle/o191"],[75139,"t1s",2,"o192","osu-slider/o192"],[75598,"t1s",0,"o193","osu-slider/o193"],[76228,"t0s",0,"o194","osu-circle/o194"],[76394,"t1s",1,"o195","osu-slider/o195"],[76909,"t0s",1,"o196","osu-circle/o196"],[77076,"t0s",2,"o197","osu-circle/o197"],[77243,"t0s",3,"o198","osu-circle/o198"],[77409,"t0s",4,"o199","osu-circle/o199"],[77576,"t0s",0,"o200","osu-circle/o200"],[77743,"t0s",5,"o201","osu-circle/o201"],[77909,"t1s",0,"o202","osu-slider/o202"],[78668,"t0s",1,"o203","osu-circle/o203"],[78835,"t0s",0,"o204","osu-circle/o204"],[79002,"t0s",2,"o205","osu-circle/o205"],[79168,"t0s",3,"o206","osu-circle/o206"],[79335,"t0s",4,"o207","osu-circle/o207"],[79502,"t1s",1,"o208","osu-slider/o208"],[80431,"t1s",0,"o209","osu-slider/o209"],[80909,"t0s",0,"o210","osu-circle/o210"],[81076,"t1s",2,"o211","osu-slider/o211"],[82020,"t0s",1,"o212","osu-circle/o212"],[82187,"t1s",0,"o213","osu-slider/o213"],[82600,"t0s",0,"o214","osu-circle/o214"],[82767,"t0s",2,"o215","osu-circle/o215"],[82933,"t1s",1,"o216","osu-slider/o216"],[83394,"t0s",1,"o217","osu-circle/o217"],[83561,"t0s",3,"o218","osu-circle/o218"],[83728,"t0s",4,"o219","osu-circle/o219"],[83894,"t1s",0,"o220","osu-slider/o220"],[84543,"t1s",1,"o221","osu-slider/o221"],[84978,"t0s",0,"o222","osu-circle/o222"],[85144,"t1s",2,"o223","osu-slider/o223"],[85896,"t0s",1,"o224","osu-circle/o224"],[86063,"t0s",2,"o225","osu-circle/o225"],[86230,"t0s",0,"o226","osu-circle/o226"],[86396,"t0s",3,"o227","osu-circle/o227"],[86563,"t1s",0,"o228","osu-slider/o228"],[87117,"t0s",1,"o229","osu-circle/o229"],[87283,"t0s",2,"o230","osu-circle/o230"],[87450,"t1s",1,"o231","osu-slider/o231"],[87998,"t0s",0,"o232","osu-circle/o232"],[88165,"t0s",3,"o233","osu-circle/o233"],[88331,"t1s",0,"o234","osu-slider/o234"],[88833,"t1s",2,"o235","osu-slider/o235"],[89755,"t0s",0,"o236","osu-circle/o236"],[89922,"t1s",0,"o237","osu-slider/o237"],[90381,"t0s",1,"o238","osu-circle/o238"],[90548,"t0s",2,"o239","osu-circle/o239"],[90715,"t0s",3,"o240","osu-circle/o240"],[90881,"t0s",4,"o241","osu-circle/o241"],[91048,"t0s",0,"o242","osu-circle/o242"],[91215,"t0s",5,"o243","osu-circle/o243"],[91381,"t1s",0,"o244","osu-slider/o244"],[92074,"t1s",1,"o245","osu-slider/o245"],[92530,"t0s",0,"o246","osu-circle/o246"],[92696,"t1s",2,"o247","osu-slider/o247"],[93637,"t0s",1,"o248","osu-circle/o248"],[93804,"t1s",0,"o249","osu-slider/o249"],[94328,"t1s",1,"o250","osu-slider/o250"],[95013,"t1s",2,"o251","osu-slider/o251"],[95511,"t0s",0,"o252","osu-circle/o252"],[95678,"t1s",0,"o253","osu-slider/o253"],[96433,"t1s",1,"o254","osu-slider/o254"],[96920,"t1s",2,"o255","osu-slider/o255"],[97400,"t0s",0,"o256","osu-circle/o256"],[97567,"t0s",1,"o257","osu-circle/o257"],[97733,"t0s",2,"o258","osu-circle/o258"],[97900,"t0s",3,"o259","osu-circle/o259"],[98067,"t0s",4,"o260","osu-circle/o260"],[98233,"t1s",0,"o261","osu-slider/o261"],[98754,"t0s",0,"o262","osu-circle/o262"],[100920,"t1s",0,"o264","osu-slider/o264"],[101444,"t0s",0,"o265","osu-circle/o265"],[101611,"t0s",1,"o266","osu-circle/o266"],[101778,"t0s",2,"o267","osu-circle/o267"],[101944,"t0s",3,"o268","osu-circle/o268"],[102111,"t0s",4,"o269","osu-circle/o269"],[102278,"t1s",1,"o270","osu-slider/o270"],[102831,"t0s",0,"o271","osu-circle/o271"],[102998,"t1s",0,"o272","osu-slider/o272"],[103405,"t0s",1,"o273","osu-circle/o273"],[103572,"t0s",2,"o274","osu-circle/o274"],[103739,"t0s",3,"o275","osu-circle/o275"],[105905,"t0s",0,"o277","osu-circle/o277"],[106072,"t1s",0,"o278","osu-slider/o278"],[106543,"t0s",1,"o279","osu-circle/o279"],[106709,"t0s",2,"o280","osu-circle/o280"],[106876,"t0s",3,"o281","osu-circle/o281"],[107043,"t0s",4,"o282","osu-circle/o282"],[107209,"t0s",0,"o283","osu-circle/o283"],[107376,"t0s",5,"o284","osu-circle/o284"],[107543,"t0s",6,"o285","osu-circle/o285"],[107709,"t0s",7,"o286","osu-circle/o286"],[107876,"t0s",1,"o287","osu-circle/o287"],[108043,"t1s",0,"o288","osu-slider/o288"],[108580,"t1s",1,"o289","osu-slider/o289"],[109491,"t0s",0,"o290","osu-circle/o290"],[109657,"t1s",0,"o291","osu-slider/o291"],[110218,"t0s",1,"o292","osu-circle/o292"],[110385,"t0s",2,"o293","osu-circle/o293"],[110552,"t1s",1,"o294","osu-slider/o294"],[111067,"t0s",0,"o295","osu-circle/o295"],[111233,"t0s",3,"o296","osu-circle/o296"],[111400,"t1s",0,"o297","osu-slider/o297"],[111859,"t1s",2,"o298","osu-slider/o298"],[112678,"t0s",0,"o299","osu-circle/o299"],[112844,"t0s",1,"o300","osu-circle/o300"]],"sounds":[]}]};
const createEngine = function createEngine(CFG, io, createGame) {
    const P = (x) => `${CFG.ns}:${x}`, players = new Map(), HIT = 1, MISS = 2, LATE = 250, PAUSE = 1024, GEN = 2048, GENS = 8192;
    const W = CFG.windows, POINTS = { great: 300, good: 100, ok: 50 };
    // (a game: a failed play is shown this long — its fall, FAILED — then stopped; a press after the first second of it plays
    //  it again. The mods a player may choose, osu!'s letters)
    const FAIL_HOLD = 4500, RETRY_AFTER = 1000, MOD_NAMES = ['HD', 'FL', 'NF', 'SD', 'PF'];
    const get = (p, name) => { try { return io.getProp ? io.getProp(p, name) : undefined; } catch (e) { return undefined; } };
    const load = (p, key) => { try { return io.load ? io.load(p, key) : undefined; } catch (e) { return undefined; } };
    const save = (p, key, v) => { try { if (io.save) io.save(p, key, v); } catch (e) { /* (kept for this session only) */ } };
    function stateOf(p) {
      let s = players.get(p.id);
      // (the generation goes on from the one the player has: a client that saw it already would not count again from a
      //  play that only set it to the same number — after a server restart the script begins at 0, the world keeps it)
      if (!s) {
        const v0 = Number(get(p, P('seq'))), g0 = Number.isFinite(v0) ? Math.floor(v0 / GEN) % GENS : 0;
        s = { seq: 0, gen: g0, from: 0, start: 0, paused: false, offset: 0, slots: new Map(), results: new Map(), cur: new Map(), groups: new Map(), judged: new Set(), marks: new Set(), played: new Set(), ringing: new Set(), round: 0, score: 0, combo: 0, best: 0, total: 0, earned: 0, health: 100,
          game: null, mode: CFG.mode || 'aim', sens: CFG.sens || 2.4, mods: [], ref: null, pending: [], prevMs: null, ge: {}, gp: {}, failAt: -1, stopAt: -1, done: false, record: 0, tour: null, last: 0 };
        players.set(p.id, s);
        // (the player's own settings for a game, kept in the world: what they chose last time)
        let o = null; try { o = JSON.parse(String(load(p, P('prefs')) || 'null')); } catch (e) { o = null; }
        if (o && typeof o === 'object') {
          if (['auto', 'aim', 'relax'].includes(o.mode)) s.mode = o.mode;
          if (o.sens > 0 && o.sens < 50) s.sens = o.sens;
          if (Number.isFinite(o.offset)) s.offset = Math.max(-500, Math.min(500, o.offset));
          if (Array.isArray(o.mods)) s.mods = o.mods.filter((m) => MOD_NAMES.includes(m));
        }
      }
      return s;
    }
    const savePrefs = (p, s) => save(p, P('prefs'), JSON.stringify({ mode: s.mode, sens: s.sens, offset: s.offset, mods: s.mods }));
    /** mods from words ('HD FL', 'hdfl', 'none') → [letters] or a reason: NF never with SD or PF (osu!'s own rule), PF over SD */
    function modsOf(words) {
      const w = words.join('').toUpperCase().replace(/[^A-Z]/g, '');
      if (!w || w === 'NONE' || w === 'NM') return [];
      const out = [];
      for (let i = 0; i < w.length; i += 2) { const m = w.slice(i, i + 2); if (!MOD_NAMES.includes(m)) return `${CFG.ns}: mods ${MOD_NAMES.join(' ')} | none (${m}?)`; if (!out.includes(m)) out.push(m); }
      if (out.includes('NF') && (out.includes('SD') || out.includes('PF'))) return `${CFG.ns}: NF cannot go with SD or PF`;
      return out.includes('PF') ? out.filter((m) => m !== 'SD') : out;
    }
    const play1 = (p, s, id) => { if (!id || !io.sound) return; try { io.sound(p, id, 1, 1); } catch (e) { /* (a sound the pack does not have: silent) */ } };
    /** every sound this player was sent stops (a pause, a seek, a stop: a sound in the game cannot be held or moved) */
    function silence(p, s) { if (io.stopSound) for (const id of s.ringing) { try { io.stopSound(p, id); } catch (e) { /* (gone) */ } } s.ringing.clear(); }
    const seqOf = (s) => CFG.sequences.find((q) => q.index === s.seq) || null;
    const nowMs = (s) => (s.paused ? s.from : s.from + (io.tick() - s.start) * 50);
    // (where the sequence is, as the client's Molang has it: loop and pingpong over its range, hold on its end)
    function seqTime(q, t) {
      const a = q.inOut ? q.inOut[0] : 0, b = q.inOut ? q.inOut[1] : q.duration, len = b - a;
      if (q.loop === 'hold') return Math.min(t, b - 0.001);
      if (!(len > 0) || t < a) return t;
      if (q.loop === 'loop') return a + ((t - a) % len);
      if (q.loop === 'pingpong') { const m = (t - a) % (2 * len); return a + (m <= len ? m : 2 * len - m); }
      return t;
    }
    // (which round of a loop or a pingpong it is: 0 before the range; a pingpong's odd rounds run backwards)
    function roundOf(q, t) {
      const a = q.inOut ? q.inOut[0] : 0, b = q.inOut ? q.inOut[1] : q.duration, len = b - a;
      if ((q.loop !== 'loop' && q.loop !== 'pingpong') || !(len > 0) || t < a) return 0;
      return Math.floor((t - a) / len);
    }
    const backwards = (q, s) => q.loop === 'pingpong' && s.round % 2 === 1;
    /** the seq property: the sequence, paused or not, the generation */
    const seqProp = (p, s) => set(p, P('seq'), s.seq + (s.paused ? PAUSE : 0) + GEN * s.gen);
    const set = (p, name, v) => { try { io.setProp(p, name, v); } catch (e) { /* (a property the pack does not have: said once by the pack's check) */ } };
    function values(p, s) {
      const acc = s.game ? s.acc : s.total ? Math.round((s.earned / s.total) * 10000) : 10000;
      set(p, P(CFG.values.score), s.score); set(p, P(CFG.values.combo), s.combo); set(p, P(CFG.values.accuracy), acc); set(p, P(CFG.values.health), Math.round(s.health));
    }
    function clearSlots(p, s) { for (const key of s.slots.keys()) set(p, P(`${key}t`), -1); s.slots.clear(); }
    /** each slot's result (3 bits of its group's property, contract.js): the result of the instance now in the slot (the last
     *  to have begun in it), 0 while it has none. Sent: the groups whose slots changed instance, and `also` (true: all) */
    function results(p, s, q, t, also) {
      for (const tp of q.templates) {
        if (!tp.events) continue;
        const now = new Map(), dirty = new Set();
        // (items in time order: in start order too — one lead for a template)
        for (const it of tp.items) { if (it[5] > t) break; now.set(it[1], it[6]); }
        for (const [k, id] of now) { const key = `${tp.tag}${k}`; if (s.cur.get(key) !== id) { s.cur.set(key, id); dirty.add(Math.floor(k / 8)); } }
        for (let g = 0; g * 8 < tp.slots; g++) {
          const name = `${tp.tag}e${g}`;
          if (!(also === true || (also && also.has(name)) || dirty.has(g))) continue;
          let v = 0;
          for (let k = g * 8; k < Math.min(tp.slots, g * 8 + 8); k++) v += (s.results.get(s.cur.get(`${tp.tag}${k}`)) || 0) * 2 ** (3 * (k - g * 8));
          if (also === true || s.groups.get(name) !== v) { s.groups.set(name, v); set(p, P(name), v); }
        }
      }
    }
    /** a new round (a play, a seek, a resume, a loop going round): nothing judged, every slot sent again */
    function newRound(p, s, q, t) {
      clearSlots(p, s);
      s.judged = new Set(); s.marks = new Set(); s.played = new Set(); s.results = new Map(); s.cur = new Map();
      if (q) {
        // (what is behind the time is judged already, with no result: a press cannot take it and it is no miss)
        for (const h of q.hits) if (h[0] + W.ok < t) s.judged.add(h[4]);
        for (const m of q.markers) if (m[0] < t) s.marks.add(m[1]);
        results(p, s, q, t, true);
      }
    }
    /** from a time on (a play, a seek, a resume): the client counts again from it (a new generation) */
    function restart(p, s, fromMs) {
      s.from = Math.max(0, Math.min(16777215, Math.round(fromMs))); s.start = io.tick(); s.gen = (s.gen + 1) % GENS;
      set(p, P('seq_from'), s.from); seqProp(p, s);
      silence(p, s);
      const q = seqOf(s);
      // (a sound starts only within LATE of its time: one already past at a seek or a resume stays silent)
      s.round = q ? roundOf(q, s.from) : 0;
      newRound(p, s, q, q ? seqTime(q, s.from) : s.from);
      if (q && q.game) gameStart(p, s, q, seqTime(q, s.from), false);
    }
    /** an instance's result, to its slot's group (seen only while it is the instance in its slot) */
    function send(p, s, q, h, result) {
      s.results.set(h[4], result);
      results(p, s, q, seqTime(q, nowMs(s)), new Set([`${h[1]}e${Math.floor(h[2] / 8)}`]));
    }
    function judgeOf(dt) { const a = Math.abs(dt); return a <= W.great ? 'great' : a <= W.good ? 'good' : a <= W.ok ? 'ok' : null; }
    // ---- osu!'s rules (osugame.js, a sequence with a game): the cursor from where the player looks, presses queued with their
    //      time, the game stepped each tick — its results to the slots, its events to the whole play's counters, its sounds
    //      played, its states to their properties (contract.js: 24 bits a property, packed as an instance's params)
    const GL = CFG.global || { events: [], groups: [], specs: {} };
    const packOf = (vals, spec) => { let n = 0, sh = 0; for (const f of spec) { const v = Math.min(Math.max(Number(vals[f.name]) || 0, f.min), f.max), L = 2 ** f.bits - 1; n += Math.round(((v - f.min) / (f.max - f.min)) * L) * 2 ** sh; sh += f.bits; } return n; };
    function gameStart(p, s, q, ms, fresh) {
      if (!q.game || !createGame) { s.game = null; return; }
      if (fresh || !s.game) { s.game = createGame(q.game, { mods: s.mods }).start(ms); s.failAt = -1; s.stopAt = -1; s.done = false; s.record = 0; }
      else s.game.seek(ms);
      s.ref = null; s.pending = []; s.prevMs = null;
    }
    /** the whole play's events (a hit, a miss, a fail…) counted up: the client takes a counter's change as the event's time */
    function countEvents(p, s, events) {
      let dirty = false;
      for (const [name] of events) if (GL.events.includes(name)) { s.ge[name] = ((s.ge[name] || 0) + 1) % 64; dirty = true; }
      if (dirty) for (let k = 0; k < GL.events.length; k += 4) { let v = 0; GL.events.slice(k, k + 4).forEach((e, j) => { v += (s.ge[e] || 0) * 2 ** (6 * j); }); set(p, P(k ? `ge${k / 4}` : 'ge'), v); }
    }
    /** the play's end (every object judged, not failed): the best kept and the scoreboard (not an autoplay's: osu! keeps none),
     *  the applause, a line in the chat */
    function finish(p, s, q, st) {
      const auto = s.mode === 'auto' || Boolean(s.tour), key = P(`best_${q.id}`);
      const best0 = Number(load(p, key)) || 0;
      if (!auto && st.score > best0) { s.record = 1; save(p, key, st.score); }
      const best = Math.max(best0, auto ? 0 : st.score);
      if (!auto && io.scoreboard) { try { io.scoreboard(p, `${CFG.ns}_best`, `osu! ${q.title || q.id}`, best); } catch (e) { /* (no scoreboard: the best is kept all the same) */ } }
      play1(p, s, q.game.sounds && q.game.sounds.applause);
      const ranks = ['-', 'D', 'C', 'B', 'A', 'S', 'SS'], mods = s.mods.length ? ` +${s.mods.join('')}` : '';
      if (io.message) { try { io.message(p, `§e${q.title || q.id}§r ${String(st.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${ranks[st.rank] || '-'} ${st.acc.toFixed(2)}% ×${st.maxcombo}${mods}${st.fc ? ' FULL COMBO' : ''}${auto ? ' (auto: not kept)' : s.record ? ' §a★ NEW RECORD§r' : ` (best ${String(best).replace(/\B(?=(\d{3})+(?!\d))/g, ',')})`}`); } catch (e) { /* (left) */ } }
    }
    function gameTick(p, s, q, ms) {
      const g = s.game, prev = s.prevMs === null ? ms : s.prevMs;
      let inp;
      if (s.mode === 'auto') inp = g.autoInput(prev, ms);
      else {
        const rot = io.rotation ? io.rotation(p) : { x: 0, y: 0 };
        if (!s.ref) s.ref = { x: rot.x, y: rot.y };
        let dy = rot.y - s.ref.y; while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
        const hx = (CFG.field && CFG.field[0]) || 90, hy = (CFG.field && CFG.field[1]) || 68;
        inp = { cx: Math.max(-hx, Math.min(hx, dy * s.sens)), cy: Math.max(-hy, Math.min(hy, -(rot.x - s.ref.x) * s.sens)), hold: io.held ? (io.held(p) ? 1 : 0) : 0, presses: s.pending.splice(0), aim: s.mode !== 'relax' };
        // (relax: held through a spinner, it spins by itself — a phone's thumb cannot draw circles with the camera)
        if (s.mode === 'relax' && inp.hold) { const a = g.autoInput(prev, ms); if (a.hold && !a.presses.length) { inp.cx = a.cx; inp.cy = a.cy; } }
      }
      s.prevMs = ms;
      const r = g.step(ms, inp);
      for (const [key, code] of r.results) { const h = q.keyMap && q.keyMap[key]; if (h) send(p, s, q, h, code); }
      countEvents(p, s, r.events);
      for (const [id] of r.sounds) play1(p, s, id);
      gameState(p, s, q);
    }
    /** the game's state to the properties: GeoUI's values, the packed groups (with the play's flags: the mods on, auto, a full
     *  combo so far, failed, a new best), and what a fail or the end calls for */
    function gameState(p, s, q) {
      const st = s.game.state();
      s.score = st.score; s.combo = st.combo; s.health = st.hp; s.acc = Math.round(st.acc * 100);
      sendGroups(p, s, st); values(p, s);
      // (failed: the music stops, the fail's sound, the play stopped once its fall has been seen — osu!'s fail screen)
      if (st.failed && s.failAt < 0) { s.failAt = nowMs(s); s.stopAt = s.failAt + FAIL_HOLD; silence(p, s); play1(p, s, q.game.sounds && q.game.sounds.fail); }
      if (st.done && !st.failed && !s.done) { s.done = true; finish(p, s, q, st); sendGroups(p, s, st); }
    }
    /** the packed groups the pack reads (contract.js STATE_GROUPS), the play's own flags with them */
    function sendGroups(p, s, st) {
      const has = (m) => (s.mods.includes(m) ? 1 : 0);
      const all = Object.assign({}, st, { hd: has('HD'), fl: has('FL'), nf: has('NF'), sd: has('SD'), pf: has('PF'), auto: s.mode === 'auto' ? 1 : 0, record: s.record });
      for (const grp of GL.groups) { const v = packOf(all, GL.specs[grp]); if (s.gp[grp] !== v) { s.gp[grp] = v; set(p, P(grp), v); } }
    }
    // ---- the tour: every look of the game, scene by scene at fixed times from its start (q.game.tour: [ms, what, …]). A scene
    //      the autoplay plays from a time on (a seek in auto, the results) takes the autoplay's play up to that time, made ready
    //      during the scene before it a slice a tick (the server's script is slow: a whole play at once stalls its tick)
    const modsIn = (c, now) => (c !== undefined && c !== null ? String(c).split(',').filter(Boolean) : now);
    /** the next scene that wants a play made ready: { k, at (the song's ms), mods } — or null */
    function prepOf(s, T0) {
      const sc = T0.q.game.tour;
      for (let k = T0.next; k < sc.length; k++) {
        const [, what, a, b, c] = sc[k];
        if (what === 'results') return { k, at: a, mods: [] };
        if (what === 'seek' && b === 'auto') return { k, at: a, mods: modsIn(c, s.mods) };
        if (what === 'stop') return null;
      }
      return null;
    }
    /** a slice of the next scene's play: as much of the song as finishes it by the scene's time (a stepped tour held on a scene:
     *  as much as finishes it in a second and a half — it waits for `tour next`) */
    function prepStep(s, T0, el) {
      const want = prepOf(s, T0);
      if (!want) { T0.prep = null; return; }
      if (!T0.prep || T0.prep.k !== want.k) T0.prep = { k: want.k, at: want.at, mods: want.mods, game: createGame(T0.q.game, { mods: want.mods }).start(0), done: 0 };
      const P0 = T0.prep;
      if (P0.done >= P0.at) return;
      const ticksLeft = Math.max(T0.held ? 30 : 1, Math.floor((T0.q.game.tour[P0.k][0] - el) / 50) - 1), slice = Math.max(1500, Math.ceil((P0.at - P0.done) / ticksLeft));
      P0.done = Math.min(P0.at, P0.done + slice); P0.game.fastForward(P0.done);
    }
    /** the play for scene k at the song's ms `at`: the one made ready (finished now if it is not yet), else made now */
    function takePrep(T0, k, at, mods) {
      const P0 = T0.prep && T0.prep.k === k && T0.prep.mods.join() === mods.join() ? T0.prep : null;
      T0.prep = null;
      return (P0 ? P0.game : createGame(T0.q.game, { mods }).start(0)).fastForward(at);
    }
    function tourStep(p, s) {
      const T0 = s.tour, q = T0.q, sc = q.game.tour;
      // (a stepped tour — `tour step`, then `tour next` for each scene after the first: its clock runs while a scene plays; at the
      //  next scene's time it holds, the play paused on the scene's last moment, until `tour next` — a shot taken late still sees
      //  its scene)
      let el;
      if (T0.manual) {
        const now = io.tick();
        if (!T0.held) T0.el += (now - T0.at) * 50;
        T0.at = now; el = T0.el;
        if (T0.next < sc.length && T0.next > T0.allow && el >= sc[T0.next][0]) {
          T0.el = el = sc[T0.next][0];
          if (!T0.held) { T0.held = true; if (s.seq && !s.paused) api.command(p, 'pause', []); }
        }
      } else el = (io.tick() - T0.t0) * 50;
      while (s.tour === T0 && T0.next < sc.length && sc[T0.next][0] <= el && (!T0.manual || T0.next <= T0.allow)) {
        const k = T0.next++, [, what, a, b, c] = sc[k];
        if (what === 'play') { s.mode = b || 'auto'; s.mods = modsIn(c, []); api.command(p, 'play', [String(q.index), String(a / 1000)]); }
        else if (what === 'seek') {
          if (b) s.mode = b;
          const mods = modsIn(c, s.mods);
          // (in auto: the autoplay's play up to the scene by the scene's mods — as if it had played so; else the play goes on
          //  from there, other mods by their rules from the start)
          if (s.game && s.mode === 'auto') s.game = takePrep(T0, k, a, mods);
          else if (s.game && mods.join() !== s.mods.join()) s.game = createGame(q.game, { mods }).start(0);
          s.mods = mods;
          if (s.seq) restart(p, s, a);
        } else if (what === 'mode') { s.mode = a; s.ref = null; }
        else if (what === 'results') {
          // (a whole play by the autoplay up to the end: the results as a full play would show them)
          s.mode = 'auto'; s.mods = [];
          if (!s.seq) api.command(p, 'play', [String(q.index), '0']);
          s.game = takePrep(T0, k, a, []); s.failAt = -1; s.stopAt = -1; s.done = false; s.record = 0;
          restart(p, s, a);
        } else if (what === 'fail' && s.game) { const r = s.game.fail(seqTime(q, nowMs(s))); countEvents(p, s, r.events); gameState(p, s, q); }
        else if (what === 'stop') api.command(p, 'stop', []);
      }
      // (over: the player's own settings back; else the next scene's play a slice nearer)
      if (s.tour === T0 && T0.next >= sc.length) { s.mode = T0.keep.mode; s.mods = T0.keep.mods; s.tour = null; }
      else if (s.tour === T0) prepStep(s, T0, el);
    }
    const api = {
      /** a scriptevent's verb and words for a player */
      command(p, verb, args) {
        const s = stateOf(p);
        if (verb === 'play') {
          const want = String(args[0] || '1'), q = CFG.sequences.find((x) => String(x.index) === want || x.id === want);
          if (!q) return `${CFG.ns}: no sequence ${want} (${CFG.sequences.map((x) => `${x.index}=${x.id}`).join(', ')})`;
          s.seq = q.index; s.last = q.index; s.paused = false; s.score = 0; s.combo = 0; s.best = 0; s.total = 0; s.earned = 0; s.health = 100; s.game = null;
          if (q.game) gameStart(p, s, q, Number(args[1] || 0) * 1000, true);
          restart(p, s, Number(args[1] || 0) * 1000); values(p, s);
          if (s.game) gameState(p, s, q);
          return '';
        }
        if (verb === 'stop') {
          // (a tour stopped, or over: the player's own settings back)
          if (s.tour) { s.mode = s.tour.keep.mode; s.mods = s.tour.keep.mods; s.tour = null; }
          s.seq = 0; s.paused = false; s.game = null; s.failAt = -1; s.stopAt = -1; seqProp(p, s); clearSlots(p, s); silence(p, s); return '';
        }
        // (how the player plays a game: auto — it plays itself; aim — the cursor where they look, a press to hit; relax — any
        //  press on time hits, sliders followed and spinners spun while held. sens: model units of cursor a degree of looking.
        //  Each kept for the player, as are the offset and the mods)
        if (verb === 'mode') { if (!['auto', 'aim', 'relax'].includes(String(args[0]))) return `${CFG.ns}: mode auto | aim | relax`; s.mode = String(args[0]); s.ref = null; if (!s.tour) savePrefs(p, s); return ''; }
        if (verb === 'sens') { const v = Number(args[0]); if (!(v > 0 && v < 50)) return `${CFG.ns}: sens <0.1…50>`; s.sens = v; savePrefs(p, s); return ''; }
        if (verb === 'offset') { const v = Number(args[0] || 0); if (!(Math.abs(v) <= 500)) return `${CFG.ns}: offset <-500…500 ms>`; s.offset = v; savePrefs(p, s); return ''; }
        // (the mods of the next play: HD FL NF SD PF, or none — osu!'s letters)
        if (verb === 'mods') { const m = modsOf(args); if (typeof m === 'string') return m; s.mods = m; if (!s.tour) savePrefs(p, s); return ''; }
        // (the last play again from its start: the same mode and mods)
        if (verb === 'retry') { if (!s.last) return `${CFG.ns}: nothing to retry`; if (s.tour) { s.mode = s.tour.keep.mode; s.mods = s.tour.keep.mods; s.tour = null; } return api.command(p, 'play', [String(s.last)]); }
        // (the tour: every look of a game in about 20 seconds, its scenes at fixed times — q.game.tour. `tour step`: the same scenes
        //  one at a time, each held on its last moment until `tour next` — what a slow camera can still take one by one)
        if (verb === 'tour') {
          if (String(args[0]) === 'next') {
            const T0 = s.tour;
            if (!T0 || !T0.manual) return `${CFG.ns}: no stepped tour (tour step first)`;
            const sc = T0.q.game.tour;
            T0.allow = T0.next; T0.at = io.tick();
            if (T0.held) { T0.held = false; if (s.seq && s.paused) api.command(p, 'resume', []); }
            if (T0.next < sc.length) T0.el = Math.max(T0.el, sc[T0.next][0]);
            tourStep(p, s);
            return '';
          }
          const manual = String(args[0]) === 'step', want = args[manual ? 1 : 0] ? String(args[manual ? 1 : 0]) : null;
          const q = CFG.sequences.find((x) => x.game && x.game.tour && (!want || String(x.index) === want || x.id === want));
          if (!q) return `${CFG.ns}: no tour (a game sequence has one)`;
          const keep = s.tour ? s.tour.keep : { mode: s.mode, mods: s.mods };
          s.tour = { q, t0: io.tick(), next: 0, keep, prep: null, ...(manual ? { manual: true, allow: 0, el: 0, at: io.tick(), held: false } : {}) };
          tourStep(p, s);
          return '';
        }
        if (!s.seq) return `${CFG.ns}: nothing is playing`;
        if (verb === 'pause') { if (!s.paused) { s.from = Math.round(nowMs(s)); s.paused = true; set(p, P('seq_from'), s.from); seqProp(p, s); silence(p, s); } return ''; }
        if (verb === 'resume') { if (s.paused) { s.paused = false; restart(p, s, s.from); } return ''; }
        if (verb === 'seek') { restart(p, s, Number(args[0] || 0) * 1000); return ''; }
        return `${CFG.ns}: unknown ${verb} (play stop pause resume seek offset mode sens mods retry tour [step|next])`;
      },
      /** what a game's menu shows a player: the game, their best, their settings (the script's forms) */
      menuInfo(p) {
        const s = stateOf(p), q = CFG.sequences.find((x) => x.game);
        if (!q) return null;
        return { index: q.index, id: q.id, title: q.title || q.id, best: Number(load(p, P(`best_${q.id}`))) || 0, mode: s.mode, sens: s.sens, offset: s.offset, mods: s.mods.slice(), playing: Boolean(s.seq), tour: Boolean(q.game.tour) };
      },
      /** every tick: the streamed slots, the misses, the markers */
      tick() {
        for (const p of io.players()) {
          const s = players.get(p.id);
          if (s && s.tour) tourStep(p, s);
          if (!s || !s.seq) continue;
          const q = seqOf(s);
          if (!q) continue;
          const raw = nowMs(s), round = roundOf(q, raw), t = seqTime(q, raw);
          // (a loop or a pingpong going round: its instances streamed and judged anew)
          if (round !== s.round) { s.round = round; newRound(p, s, q, t); }
          const back = backwards(q, s);
          for (const tp of q.templates) {
            if (tp.mode !== 'streamed') continue;
            const want = new Map();
            for (const it of tp.items) if (t >= it[0] - tp.lead - CFG.margin && t < it[3]) want.set(`${tp.tag}${it[1]}`, it);
            for (const [key, it] of want) if (s.slots.get(key) !== it) { s.slots.set(key, it); set(p, P(`${key}p`), it[2]); set(p, P(`${key}t`), it[0]); }
            for (const key of [...s.slots.keys()]) if (key.startsWith(tp.tag) && !want.has(key) && q.templates.every((o) => o === tp || !key.startsWith(o.tag))) { s.slots.delete(key); set(p, P(`${key}t`), -1); }
          }
          results(p, s, q, t, false);
          if (s.game && !s.paused) {
            gameTick(p, s, q, t);
            // (a failed play: stopped once its fall has been seen; a game held on its end: stopped a while after, its results seen)
            if (s.stopAt >= 0 && raw >= s.stopAt) { api.command(p, 'stop', []); continue; }
            if (q.autoStop && raw > q.autoStop) { api.command(p, 'stop', []); continue; }
            // (the music and the other audio clips — none once the play failed: osu!'s music stops there)
            if (s.failAt < 0) (q.sounds || []).forEach((c, i) => { if (s.played.has(i) || t < c[0] || t >= c[0] + LATE) return; s.played.add(i); if (!io.sound) return; try { io.sound(p, c[1], c[2], c[3]); s.ringing.add(c[1]); } catch (e) { /* (silent) */ } });
            for (const m of q.markers) if (!s.marks.has(m[1]) && t >= m[0]) { s.marks.add(m[1]); if (m[2] !== undefined && io.event) io.event(p, `${CFG.ns}:marker`, `${q.index}:${m[1]}${m[2] ? ` ${m[2]}` : ''}`); }
            continue;
          }
          if (!s.paused && !back) {
            // (the sequence's audio clips, each once a round)
            (q.sounds || []).forEach((c, i) => {
              if (s.played.has(i) || t < c[0] || t >= c[0] + LATE) return;
              s.played.add(i);
              if (!io.sound) return;
              try { io.sound(p, c[1], c[2], c[3]); s.ringing.add(c[1]); } catch (e) { /* (a sound the pack does not have: silent) */ }
            });
            for (const h of q.hits) if (!s.judged.has(h[4]) && t > h[0] + W.ok) {
              s.judged.add(h[4]); send(p, s, q, h, MISS);
              s.combo = 0; s.total += 1; s.health = Math.max(0, s.health - CFG.missDrain); values(p, s);
            }
            for (const m of q.markers) if (!s.marks.has(m[1]) && t >= m[0]) { s.marks.add(m[1]); if (m[2] !== undefined && io.event) io.event(p, `${CFG.ns}:marker`, `${q.index}:${m[1]}${m[2] ? ` ${m[2]}` : ''}`); }
          }
        }
      },
      /** a press (a button, an item used): the nearest instance not judged yet, within the widest window */
      press(p) {
        const s = players.get(p.id);
        if (!s || !s.seq || s.paused) return null;
        const q = seqOf(s);
        if (!q || backwards(q, s)) return null;
        // (a game: the press queued with its time, judged by the game on the next tick — where the cursor is. A failed play: a
        //  press after its first second plays it again — osu!'s retry)
        if (s.game) {
          if (s.failAt >= 0) { if (nowMs(s) - s.failAt >= RETRY_AFTER && !s.tour) { api.command(p, 'retry', []); return { retry: true }; } return null; }
          if (s.mode !== 'auto') s.pending.push(seqTime(q, nowMs(s)) + s.offset);
          return { queued: true };
        }
        const t = seqTime(q, nowMs(s)) + s.offset;
        let best = null;
        for (const h of q.hits) if (!s.judged.has(h[4]) && Math.abs(t - h[0]) <= W.ok && (!best || Math.abs(t - h[0]) < Math.abs(t - best[0]))) best = h;
        if (!best) return null;
        const j = judgeOf(t - best[0]);
        s.judged.add(best[4]); send(p, s, q, best, HIT);
        s.combo += 1; s.best = Math.max(s.best, s.combo); s.total += 1; s.earned += POINTS[j] / 300;
        s.score += POINTS[j] * (1 + Math.floor(s.combo / 10) / 10); s.score = Math.round(s.score);
        s.health = Math.min(100, s.health + CFG.hitGain); values(p, s);
        return { judge: j, dt: t - best[0], instance: best[3] };
      },
      /** a player (back) in the world: a client that joins again counts from its own first moment, so the sequence it was
       *  playing is sent again from where it is now; with nothing playing for it, a sequence its properties still name (a
       *  world saved while one played) is stopped */
      joined(p) {
        const s = players.get(p.id);
        if (s && s.seq) { restart(p, s, nowMs(s)); values(p, s); return; }
        const st = stateOf(p);
        if (Number(get(p, P('seq'))) % PAUSE !== 0) { st.seq = 0; st.paused = false; seqProp(p, st); }
      },
      state: (p) => players.get(p.id),
    };
    return api;
  };
const createGame = null;
const engine = createEngine(CFG, {
  tick: () => system.currentTick,
  setProp: (p, name, value) => { if (p.isValid) p.setProperty(name, value); },
  getProp: (p, name) => (p.isValid ? p.getProperty(name) : undefined),
  players: () => world.getAllPlayers(),
  event: (p, id, message) => system.sendScriptEvent(id, message),
  sound: (p, id, volume, pitch) => { if (p.isValid) p.playSound(id, { volume, pitch }); },
  stopSound: (p, id) => { if (p.isValid) p.runCommand(`stopsound @s ${id}`); },
  rotation: (p) => (p.isValid ? p.getRotation() : { x: 0, y: 0 }),
  held: (p) => { if (!p.isValid) return false; const i = p.inputInfo; return i.getButtonState(InputButton.Jump) === ButtonState.Pressed || i.getButtonState(InputButton.Sneak) === ButtonState.Pressed; },
  // (the player's own values kept in the world: a game's settings and best)
  load: (p, key) => (p.isValid ? p.getDynamicProperty(key) : undefined),
  save: (p, key, v) => { if (p.isValid) p.setDynamicProperty(key, v); },
  scoreboard: (p, id, name, score) => { const sb = world.scoreboard, o = sb.getObjective(id) ?? sb.addObjective(id, name); if (p.isValid) o.setScore(p, score); },
  message: (p, text) => { if (p.isValid) p.sendMessage(text); },
}, createGame);
// (a player who joins again counts from their own first moment: what they were playing is sent again from where it is)
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) engine.joined(e.player); }); });
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(CFG.ns.length + 1);
  if (!['play', 'stop', 'pause', 'resume', 'seek', 'offset', 'mode', 'sens', 'mods', 'retry', 'tour'].includes(verb)) return;
  const words = String(e.message).trim().split(/\s+/).filter(Boolean);
  const targets = e.sourceEntity && e.sourceEntity.typeId === 'minecraft:player' ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = engine.command(p, verb, words); if (why) console.warn(why); }
}, { namespaces: [CFG.ns] });
system.runInterval(() => engine.tick(), 1);
world.afterEvents.playerButtonInput.subscribe((e) => { if (e.newButtonState === ButtonState.Pressed) engine.press(e.player); });
world.afterEvents.itemUse.subscribe((e) => engine.press(e.source));
