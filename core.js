export const VERSION='1.0.0';
export const KEYS=['gas','grid','feed','pv'];
export const METRICS={pv:['PV-Ertrag','kWh','#377557'],grid:['Netzbezug','kWh','#3672b3'],gas:['Gasverbrauch','m³','#be6629'],feed:['Einspeisung','kWh','#8965a6'],self:['PV-Eigenverbrauch','kWh','#79a365'],total:['Gesamtstrom','kWh','#173f4d'],autarky:['Autarkie','%','#387d79'],ratio:['Eigenverbrauchsquote','%','#a7803b']};
export const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
export const clone=x=>JSON.parse(JSON.stringify(x));
export const validMonth=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&+m.slice(0,4)>=1900;
export function prevMonth(m){let [y,n]=m.split('-').map(Number);if(--n===0){y--;n=12}return `${y}-${String(n).padStart(2,'0')}`}
export function lastMonth(d=new Date()){return prevMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
export const monthLabel=m=>`${MONTHS[+m.slice(5)-1]} ${m.slice(0,4)}`;
export const endDate=m=>`${m}-${new Date(+m.slice(0,4),+m.slice(5),0).getDate()}`;
export function parseNumber(v){
 if(v===null||v===undefined||String(v).trim()==='')return null;
 if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Keine endliche Zahl.');return v}
 let s=String(v).trim();
 if(/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/.test(s))s=s.replaceAll('.','').replace(',','.');
 else if(/^[+-]?\d+,\d+$/.test(s))s=s.replace(',','.');
 else if(/^[+-]?\d{1,3}\.\d{3}$/.test(s))throw Error('Mehrdeutige Zahl: Bitte ohne Tausenderpunkte und mit Dezimalkomma eingeben.');
 if(!/^[+-]?\d+(?:\.\d+)?$/.test(s))throw Error('Zahl nicht erkannt. Beispiel: 1234,56 (ohne Tausendertrennzeichen).');
 const n=Number(s);if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('Zahl außerhalb des unterstützten Bereichs.');return n;
}
export function emptyRecord(month){return {month,gas:{reading:null,amount:null,quality:'measured',note:''},grid:{reading:null,amount:null,quality:'measured',note:''},feed:{reading:null,amount:null,quality:'measured',note:''},pv:{amount:null,quality:'measured',note:''},readDate:'',note:''}}
export function initialState(){return {schema:1,revision:0,records:[],settings:{backupDays:30,lastBackup:null},metadata:{createdAt:new Date().toISOString(),appVersion:VERSION},history:[]}}
export function validateRecord(r){
 if(!r||!validMonth(r.month))throw Error('Ungültiger Monat (erwartet JJJJ-MM).');
 for(const k of KEYS){const a=r[k];if(!a||typeof a!=='object')throw Error(`${r.month}: Messgröße ${k} fehlt.`);
 for(const f of ['reading','amount'])if(a[f]!=null&&(typeof a[f]!=='number'||!Number.isFinite(a[f])||Math.abs(a[f])>1e12))throw Error(`${r.month}: ${k}/${f} ist keine gültige Zahl.`);
 if(!['measured','estimated','check'].includes(a.quality))throw Error(`${r.month}: Ungültige Datenqualität.`);
 if(a.reset){for(const f of ['oldEnd','newStart'])if(a.reset[f]!=null&&(typeof a.reset[f]!=='number'||!Number.isFinite(a.reset[f])))throw Error(`${r.month}: Ungültiger Zählerwechsel.`)}
 if(a.note!=null&&typeof a.note!=='string')throw Error(`${r.month}: Ungültige Messnotiz.`);
 }
 if(r.readDate){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.readDate)||new Date(r.readDate+'T12:00:00Z').toISOString().slice(0,10)!==r.readDate)throw Error(`${r.month}: Ungültiges Ablesedatum.`)}
 if(r.note!=null&&typeof r.note!=='string')throw Error(`${r.month}: Ungültige Notiz.`);return r;
}
export function validateRecords(records){if(!Array.isArray(records)||records.length>24000)throw Error('Ungültiger oder zu großer Datenbestand.');const seen=new Set();for(const r of records){validateRecord(r);if(seen.has(r.month))throw Error(`${r.month}: Doppelter Monat in der Importdatei.`);seen.add(r.month)}return records}
export function validateBackup(b){if(b?.schema!==1||!b.settings||!b.metadata||!Array.isArray(b.history))throw Error('Keine unterstützte vollständige Energie-Monitor-Sicherung (Version 1).');validateRecords(b.records);for(const h of b.history){if(!h.snapshot?.settings||!h.snapshot?.metadata)throw Error('Ungültige Änderungshistorie.');validateRecords(h.snapshot.records)}return b}
const rnd=n=>Math.round(n*1e6)/1e6;
export function calculate(records){const map=new Map(records.map(r=>[r.month,r]));return [...records].sort((a,b)=>a.month.localeCompare(b.month)).map(r=>{
 const p=map.get(prevMonth(r.month));const out={month:r.month,warnings:[],estimated:{},raw:r};
 for(const k of KEYS){const a=r[k];let v=null;let est=a.quality==='estimated';
 if(a.amount!=null){v=a.amount;if(k!=='pv'&&a.reading!=null)out.warnings.push(`${METRICS[k][0]}: direkte Monatsmenge hat Vorrang; Stand bleibt als Anschlusswert erhalten.`)}
 else if(k!=='pv'&&a.reading!=null){if(p?.[k]?.reading!=null){est ||= p[k].quality==='estimated';if(a.reset){if(a.reset.oldEnd!=null&&a.reset.newStart!=null){v=rnd(a.reset.oldEnd-p[k].reading+a.reading-a.reset.newStart);if(a.reset.oldEnd<p[k].reading||a.reading<a.reset.newStart)out.warnings.push(`${METRICS[k][0]}: Zählerwechsel-Stände widersprüchlich.`)}else out.warnings.push(`${METRICS[k][0]}: Wechsel unvollständig; Monatsmenge ergänzen.`)}else v=rnd(a.reading-p[k].reading)}else out.warnings.push(`${METRICS[k][0]}: Stand des direkten Vormonats fehlt.`)}
 out[k]=v;out.estimated[k]=est;
 if(v!=null&&v<0)out.warnings.push(`${METRICS[k][0]} negativ – Zählerwechsel oder Eingabe prüfen.`);
 if(a.quality==='check')out.warnings.push(`${METRICS[k][0]}: als „Prüfen“ markiert.`);
 if(v!=null&&v>(k==='gas'?1000:10000))out.warnings.push(`${METRICS[k][0]} ungewöhnlich hoch; Grenzwert nur Orientierung.`);
 }
 if(out.pv>=100&&out.feed>out.pv*.95&&out.feed<=out.pv)out.warnings.push('Einspeisung nahezu so hoch wie PV-Ertrag – Ablesezeitraum und Werte prüfen.');
 out.self=out.pv!=null&&out.feed!=null?rnd(out.pv-out.feed):null;
 if(out.self!=null&&(out.self<0||out.pv<0||out.feed<0))out.warnings.push('Einspeisung/PV widersprüchlich. Negative Bilanz bleibt sichtbar; Gesamtstrom und Quoten nicht verfügbar.');
 out.total=out.self!=null&&out.self>=0&&out.grid!=null&&out.grid>=0&&out.pv>=0&&out.feed>=0?rnd(out.grid+out.self):null;
 out.autarky=out.total>0?out.self/out.total*100:null;
 out.ratio=out.pv>0&&out.self>=0&&out.self!=null&&out.feed>=0?out.self/out.pv*100:null;
 out.estimated.self=out.estimated.pv||out.estimated.feed;out.estimated.total=out.estimated.self||out.estimated.grid;out.estimated.autarky=out.estimated.total;out.estimated.ratio=out.estimated.self;
 if(r.readDate&&r.readDate!==endDate(r.month)||p?.readDate&&p.readDate!==endDate(p.month))out.warnings.push('Abweichendes Ablesedatum: Differenzen entsprechen nicht genau dem Kalendermonat.');
 out.missing=KEYS.filter(k=>out[k]==null);return out;
 })}
export function aggregate(rows,key){let use=rows.filter(r=>r[key]!=null);let value=null;if(key==='autarky'){use=rows.filter(r=>r.total!=null&&r.total>=0&&r.self!=null&&r.self>=0);const d=use.reduce((s,r)=>s+r.total,0);value=d?use.reduce((s,r)=>s+r.self,0)/d*100:null}else if(key==='ratio'){use=rows.filter(r=>r.pv!=null&&r.pv>=0&&r.self!=null&&r.self>=0&&r.feed>=0);const d=use.reduce((s,r)=>s+r.pv,0);value=d?use.reduce((s,r)=>s+r.self,0)/d*100:null}else value=use.length?rnd(use.reduce((s,r)=>s+r[key],0)):null;return {value,count:use.length,estimated:use.some(r=>r.estimated[key]),months:use.map(r=>+r.month.slice(5))}}
export function compareYears(rows,y,a,key){const left=rows.filter(r=>+r.month.slice(0,4)===+y&&r[key]!=null);const right=rows.filter(r=>+r.month.slice(0,4)===+a&&r[key]!=null);const months=left.filter(r=>right.some(t=>t.month.slice(5)===r.month.slice(5))).map(r=>r.month.slice(5));const x=aggregate(left.filter(r=>months.includes(r.month.slice(5))),key).value;const z=aggregate(right.filter(r=>months.includes(r.month.slice(5))),key).value;return {months,a:x,b:z,delta:x!=null&&z!=null?rnd(x-z):null,percent:z?((x-z)/Math.abs(z)*100):null}}
export function snapshot(s){return clone({records:s.records,settings:s.settings,metadata:s.metadata})}
export function mergeRecords(current,incoming,choices={}){validateRecords(incoming);const map=new Map(current.map(r=>[r.month,clone(r)]));for(const r of incoming){const old=map.get(r.month);const mode=choices[r.month]||'merge';if(!old){if(mode!=='skip')map.set(r.month,clone(r));continue}if(mode==='skip')continue;if(mode==='replace'){map.set(r.month,clone(r));continue}for(const k of KEYS){for(const f of ['reading','amount'])if(old[k][f]==null&&r[k][f]!=null){old[k][f]=r[k][f];old[k].quality=r[k].quality}if(!old[k].note)old[k].note=r[k].note||'';else if(r[k].note&&!old[k].note.includes(r[k].note))old[k].note+='\n'+r[k].note;if(!old[k].reset&&r[k].reset)old[k].reset=clone(r[k].reset)}if(!old.readDate)old.readDate=r.readDate||'';if(r.note&&!old.note?.includes(r.note))old.note=[old.note,r.note].filter(Boolean).join('\n');}
 return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month))}
export function conflictType(a,b){if(!a)return 'Neu';return JSON.stringify(a)===JSON.stringify(b)?'Identisch':KEYS.some(k=>['reading','amount'].some(f=>a[k][f]!=null&&b[k][f]!=null&&a[k][f]!==b[k][f]))?'Widerspruch':'Ergänzung / Metadaten'}
export function parseCSV(text){text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0];const delimiter=first.includes(';')?';':first.includes('\t')?'\t':',';let rows=[],row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted||cell==='')quoted=!quoted;else throw Error('Ungültiges Anführungszeichen in CSV.')}else if(c===delimiter&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw Error('CSV: Nicht geschlossenes Anführungszeichen.');row.push(cell);if(row.some(x=>x!==''))rows.push(row);return rows}
export function csvText(rows){return '\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n')}
