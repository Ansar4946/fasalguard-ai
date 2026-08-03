import type { DistrictSummary, ImpactMetric } from "./types";
export const districtSummaries:DistrictSummary[]=[
 {district:"Multan",crop:"Cotton",risk:"critical",reports:186,confirmed:42,farmersWarned:1420,responseHours:2.8},
 {district:"Khanewal",crop:"Cotton",risk:"high",reports:118,confirmed:31,farmersWarned:980,responseHours:3.6},
 {district:"Sahiwal",crop:"Wheat",risk:"moderate",reports:74,confirmed:18,farmersWarned:640,responseHours:4.1},
 {district:"Bahawalpur",crop:"Cotton",risk:"low",reports:39,confirmed:8,farmersWarned:410,responseHours:5.2},
];
export const impactMetrics:ImpactMetric[]=[
 {label:"Registered farmers",value:"143,890",change:"+8.4%",context:"Demo platform accounts"},
 {label:"Crop scans",value:"3,014",change:"+12.1%",context:"Selected reporting period"},
 {label:"Farmers warned",value:"2,812",change:"+18.6%",context:"Relevant nearby alerts"},
 {label:"Expert confirmations",value:"341",change:"+9.2%",context:"Reviewed cases"},
 {label:"Fields monitored",value:"52,480",change:"+6.7%",context:"Active field records"},
 {label:"Median response",value:"2h 51m",change:"-14 min",context:"Expert response time"},
 {label:"AI agreement",value:"82%",change:"+2.3%",context:"Compared with expert decisions"},
 {label:"Outbreaks identified",value:"1,284",change:"+11.5%",context:"Suspected and confirmed clusters"},
];
