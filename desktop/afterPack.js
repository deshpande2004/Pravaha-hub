// Embeds the Pravahahub icon and version info into Pravahahub.exe without wine (pure JS via resedit).
const fs = require('fs'); const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit');
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const data = fs.readFileSync(exe);
  const pe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(pe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build', 'icon.ico')));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const v = ctx.packager.appInfo.version.split('.').map(Number);
  vi.setFileVersion(v[0], v[1], v[2], 0, 1033); vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'Pravahahub', FileDescription: 'Pravahahub', CompanyName: 'Pravahahub', OriginalFilename: 'Pravahahub.exe', InternalName: 'Pravahahub', LegalCopyright: 'MIT' });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
};
