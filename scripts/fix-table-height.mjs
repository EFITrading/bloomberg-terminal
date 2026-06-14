import { readFileSync, writeFileSync } from "fs";
const path = "c:/Users/zakho/Documents/bloomberg-terminal/src/components/analytics/GexPanel.tsx";
let content = readFileSync(path, "utf8");
const oldStr = `maxHeight: isMobile
                                          ? 'calc(100.97vh - 278.94px)'
                                          : 'calc(71.74vh - 259.02px)',`;
const newStr = `maxHeight: isMobile
                                          ? 'calc(100.97vh - 278.94px)'
                                          : showOI ? '1350px' : 'calc(71.74vh - 259.02px)',`;
const count = content.split(oldStr).length - 1;
console.log("Found:", count, "occurrences");
content = content.split(oldStr).join(newStr);
writeFileSync(path, content);
console.log("Done");
