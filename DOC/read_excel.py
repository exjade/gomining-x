import zipfile
import json
import xml.etree.ElementTree as ET

ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

with zipfile.ZipFile(r'C:\Users\Roman\Documents\MinerX\DOC\Ciclos_de_minado_PERL.xlsx') as z:
    wb_xml = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = [s.attrib['name'] for s in wb_xml.findall('.//m:sheet', ns)]

    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        sst_xml = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in sst_xml.findall('.//m:si', ns):
            texts = [t.text for t in si.findall('.//m:t', ns) if t.text]
            shared_strings.append("".join(texts))

    data_summary = {}

    for idx, sheet_name in enumerate(sheets, 1):
        target_file = f'xl/worksheets/sheet{idx}.xml'
        if target_file not in z.namelist():
            continue
        sheet_xml = ET.fromstring(z.read(target_file))
        rows = sheet_xml.findall('.//m:row', ns)
        sheet_data = []
        for row in rows[:25]:
            r_num = row.attrib.get('r')
            row_dict = {}
            for c in row.findall('m:c', ns):
                col = c.attrib.get('r')
                t = c.attrib.get('t')
                v = c.find('m:v', ns)
                val = v.text if v is not None else ''
                if t == 's' and val.isdigit():
                    idx_str = int(val)
                    if idx_str < len(shared_strings):
                        val = shared_strings[idx_str]
                row_dict[col] = val
            if row_dict:
                sheet_data.append(row_dict)
        data_summary[sheet_name] = sheet_data

    with open(r'C:\Users\Roman\Documents\MinerX\DOC\excel_summary.json', 'w', encoding='utf-8') as f:
        json.dump(data_summary, f, indent=2, ensure_ascii=False)
    print("Excel summary saved to excel_summary.json successfully.")
