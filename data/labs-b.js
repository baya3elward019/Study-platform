/* مشاريع عملية على Azure — المشاريع 6 إلى 10 (آخر AZ-104، وبعدها AZ-500 و SC-200 و IoT). */
window.SAHABA_LABS.push(

/* ───────── 06 ───────── */
{ id: "lab06", grp: "AZ-104", track: "AZ-104", log: "AZ-104", lvl: "متوسط", time: "ساعتين (فيهم انتظار)", cost: "VM صغيرة + backup صغير", secs: ["5.2"],
  t: "الملف اتمسح: Backup واسترجاع", en: "Azure Backup, restore and soft delete",
  scn: "موظف مسح ملف مهم من سيرفر. وبعدها بأسبوع حد مسح الـ backup نفسه بالغلط. المطلوب تثبت إنك تقدر ترجّع في الحالتين.",
  goal: "تعمل backup لـ VM، ترجّع منه، وتفهم الـ soft delete وليه مسح الـ vault مش بسيط.",
  arch: `vm-bak (data.txt) ──► Recovery Services vault  rsv-lab  (LRS)
                          ├─ Backup policy (Enhanced)
                          ├─ Recovery points
                          │     └─► Restore disks ──► new managed disk
                          └─ Soft delete: 14 days`,
  need: ["وقت: أول backup ممكن ياخد من 30 لـ 60 دقيقة", "الـ vault والـ VM لازم يكونوا في نفس الـ region"],
  setup: `RG=rg-lab-06
LOC=westeurope
SA=strestore$RANDOM$RANDOM
az group create -n $RG -l $LOC
az vm create -g $RG -n vm-bak --image Ubuntu2204 --size Standard_B1s \\
  --public-ip-sku Standard --nsg-rule NONE --admin-username azureuser --generate-ssh-keys
az vm run-command invoke -g $RG -n vm-bak --command-id RunShellScript \\
  --scripts "echo 'payroll 2026 - do not delete' > /home/azureuser/data.txt"`,
  steps: [
    { t: "اعمل Recovery Services vault",
      d: "اعمل `rsv-lab` وخلّي الـ storage redundancy هي LRS عشان التكلفة. الإعداد ده بيتقفل بعد أول عنصر يتحمي.",
      v: "`az backup vault backup-properties show -g $RG -n rsv-lab` بيطلّع LocallyRedundant.",
      h: "الافتراضي GRS. غيّره قبل ما تحمي أي حاجة.",
      c: `az backup vault create -g $RG -n rsv-lab -l $LOC
az backup vault backup-properties set -g $RG -n rsv-lab --backup-storage-redundancy LocallyRedundant` },
    { t: "فعّل الحماية على الـ VM",
      d: "اعرض الـ policies الموجودة في الـ vault واحمي `vm-bak` بالـ Enhanced policy.",
      v: "`az backup item list -g $RG -v rsv-lab -o table` بيطلّع الـ VM.",
      h: "الـ VMs الجديدة نوعها Trusted Launch، والـ Enhanced policy هي المدعومة ليها في كل الأدوات.",
      c: `az backup policy list -g $RG -v rsv-lab -o table
az backup protection enable-for-vm -g $RG -v rsv-lab --vm vm-bak --policy-name EnhancedPolicy` },
    { t: "خد backup دلوقتي",
      d: "ماتستناش الجدول. شغّل on-demand backup وراقب الـ job.",
      v: "الـ job حالته Completed. فيه مرحلتين: snapshot (سريعة) ونقل للـ vault (أطول).",
      h: "`--retain-until` بياخد التاريخ بصيغة `dd-mm-yyyy`.",
      c: `az backup protection backup-now -g $RG -v rsv-lab --container-name vm-bak --item-name vm-bak \\
  --backup-management-type AzureIaasVM --retain-until $(date -u -d "+7 days" +%d-%m-%Y)
watch -n 60 "az backup job list -g $RG -v rsv-lab -o table"` },
    { t: "امسح الملف",
      d: "دي الكارثة: امسح `data.txt` من الـ VM.",
      v: "`ls /home/azureuser` مفيهوش الملف.",
      h: "",
      c: `az vm run-command invoke -g $RG -n vm-bak --command-id RunShellScript \\
  --scripts "rm /home/azureuser/data.txt; ls -la /home/azureuser"` },
    { t: "رجّع الـ disk من recovery point",
      d: "اعمل restore للـ disks في نفس الـ RG. محتاج storage account كـ staging. بعدها هيبقى عندك new managed disk فيه الملف.",
      v: "`az disk list -g $RG -o table` فيه disk جديد غير بتاع الـ VM.",
      h: "فيه 3 طرق للاسترجاع: restore disks، إنشاء VM جديدة، أو file recovery من غير ما ترجّع الـ disk كله.",
      c: `az storage account create -n $SA -g $RG -l $LOC --sku Standard_LRS
RP=$(az backup recoverypoint list -g $RG -v rsv-lab --container-name vm-bak --item-name vm-bak \\
  --backup-management-type AzureIaasVM --query "[0].name" -o tsv)
az backup restore restore-disks -g $RG -v rsv-lab --container-name vm-bak --item-name vm-bak \\
  --rp-name $RP --storage-account $SA --target-resource-group $RG
az backup job list -g $RG -v rsv-lab -o table` },
    { t: "جرّب File Recovery",
      d: "لو المطلوب ملف واحد، استرجاع disk كامل تقيل. من الـ portal استخدم File Recovery: بينزّل script بيعمل mount للـ recovery point كـ drive على الـ VM لمدة 12 ساعة.",
      v: "شفت شاشة File Recovery واخترت recovery point ونزّلت الـ script. (تشغيله محتاج تدخل على الـ VM.)",
      h: "الـ script بيتشغّل على نفس الـ VM أو أي جهاز بنفس نظام التشغيل، ومحتاج outbound.",
      c: `Portal:
rsv-lab > Backup items > Azure Virtual Machine > vm-bak > File Recovery
  1) اختار recovery point
  2) Download Script  (+ باسورد بيظهر مرة واحدة)
  3) شغّله على الـ VM > الملفات بتظهر تحت mount point
  4) Unmount Disks بعد ما تخلص` },
    { t: "اعمل policy مخصصة",
      d: "اعمل backup policy يومية الساعة 2 الفجر، تحتفظ بـ 7 يومي و 4 أسبوعي، وانقل الـ VM عليها.",
      v: "الـ VM في Backup items مربوطة بالـ policy الجديدة.",
      h: "الـ instant restore snapshots بتتحفظ جنب الـ VM لأيام محددة وده اللي بيخلّي الاسترجاع سريع.",
      c: `Portal:
rsv-lab > Backup policies > + Add > Azure Virtual Machine > Enhanced
  Name: daily-0200     Frequency: Daily 02:00     Instant restore: 2 days
  Retention: Daily 7 days , Weekly (Sunday) 4 weeks
rsv-lab > Backup items > vm-bak > Backup policy > daily-0200` },
    { t: "امسح الـ backup ورجّعه",
      d: "وقّف الحماية مع مسح الداتا. العنصر مش هيختفي: هيدخل soft-deleted لمدة 14 يوم. رجّعه بـ undelete.",
      v: "بعد المسح حالة العنصر soft deleted، وبعد الـ undelete رجع (والحماية واقفة لحد ما تشغّلها تاني).",
      h: "الـ soft delete بقى مفروض افتراضياً ومش بيتعطّل في الـ regions اللي فيها secure by default.",
      c: `az backup protection disable -g $RG -v rsv-lab --container-name vm-bak --item-name vm-bak \\
  --backup-management-type AzureIaasVM --delete-backup-data true --yes
az backup item list -g $RG -v rsv-lab -o table

az backup protection undelete -g $RG -v rsv-lab --container-name vm-bak --item-name vm-bak \\
  --backup-management-type AzureIaasVM --workload-type VM` }
  ],
  brk: { t: "امسح الـ vault",
    d: "قبل ما تنضّف: جرّب تمسح الـ vault وهو فيه عنصر محمي. اقرا رسالة الخطأ واكتب الترتيب الصحيح للمسح.",
    h: "الـ vault مش بيتمسح طول ما فيه backup items أو عناصر soft-deleted.",
    c: `az backup vault delete -g $RG -n rsv-lab --yes   # يفشل

# الترتيب: (1) وقّف الحماية وامسح الداتا لكل عنصر
#          (2) العناصر بتفضل soft-deleted 14 يوم
#          (3) بعدها الـ vault يتمسح` },
  clean: { d: "الـ vault اللي فيه عناصر soft-deleted ممكن مايتمسحش فوراً. امسح كل حاجة تانية وسيبه، وهو بيتمسح بعد 14 يوم ومفيش تكلفة احتفاظ في المدة دي.",
    c: `az backup protection disable -g $RG -v rsv-lab --container-name vm-bak --item-name vm-bak \\
  --backup-management-type AzureIaasVM --delete-backup-data true --yes

az group delete -n rg-lab-06 --yes
# لو مسح الـ RG فشل بسبب الـ vault، امسح الباقي بالاسم:
az vm delete -g rg-lab-06 -n vm-bak --yes
az disk list -g rg-lab-06 --query "[].id" -o tsv | xargs -r az disk delete --yes --ids
az storage account list -g rg-lab-06 --query "[].id" -o tsv | xargs -r az storage account delete --yes --ids
# وامسح الـ vault من الـ portal: بيدخل soft-deleted وبيختفي لوحده` },
  explain: ["الفرق بين Recovery Services vault و Backup vault", "ليه الـ vault والـ VM لازم في نفس الـ region", "الفرق بين snapshot tier و vault tier", "الـ soft delete بيحمي من إيه، وليه بقى مفروض", "الفرق بين Azure Backup و Azure Site Recovery"],
  refs: [["Back up Azure VMs", "https://learn.microsoft.com/en-us/azure/backup/backup-azure-vms-introduction"], ["Secure by default (soft delete)", "https://learn.microsoft.com/en-us/azure/backup/secure-by-default"]] },

/* ───────── 07 ───────── */
{ id: "lab07", grp: "AZ-104", track: "AZ-104", log: "AZ-104", lvl: "متوسط", time: "90 دقيقة", cost: "F1 مجاني · S1 لساعة واحدة", secs: ["3.1", "3.4"],
  t: "انشر المنصة دي على Azure بـ Bicep", en: "Deploy this platform to App Service with Bicep and slots",
  scn: "المنصة شغالة على GitHub Pages. المطلوب نسخة على App Service متعرّفة كلها كـ code، وتحديثات بتتجرّب على staging الأول وتتنقل للإنتاج من غير توقف، ورجوع فوري لو التحديث باظ.",
  goal: "تكتب أول Bicep file، تفهم what-if والـ idempotency، وتستخدم deployment slots.",
  arch: `main.bicep ── az deployment group create ──► rg-lab-07
                                               ├─ App Service plan  (F1 → S1)
                                               └─ Web app  (HTTPS only, TLS 1.2)
                                                    ├─ slot: production ◄─┐ swap
                                                    └─ slot: staging   ───┘
site.zip (index.html + assets + data) ── az webapp deploy`,
  need: ["`git` و `zip` و `python3` (كلهم في Cloud Shell)"],
  setup: `RG=rg-lab-07
LOC=westeurope
az group create -n $RG -l $LOC
git clone https://github.com/baya3elward019/Study-platform.git && cd Study-platform`,
  steps: [
    { t: "اكتب main.bicep",
      d: "ملف واحد فيه App Service plan و web app. الـ SKU والاسم parameters، و HTTPS only، وأقل TLS هو 1.2، والـ FTP مقفول.",
      v: "`az bicep build --file main.bicep` بيعدّي من غير أخطاء.",
      h: "الـ web app بيشاور على الـ plan بـ `serverFarmId: plan.id`، وده اللي بيخلّي Bicep يعرف الترتيب من غير `dependsOn`.",
      c: `cat > main.bicep <<'EOF'
param location string = resourceGroup().location
param appName string = 'sahaba-\${uniqueString(resourceGroup().id)}'
@allowed(['F1', 'S1'])
param sku string = 'F1'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-\${appName}'
  location: location
  sku: { name: sku }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
    }
  }
}

output name string = app.name
output url string = 'https://\${app.properties.defaultHostName}'
EOF
az bicep build --file main.bicep --stdout > /dev/null && echo OK` },
    { t: "شغّل what-if وبعدين انشر",
      d: "شوف إيه اللي هيتغيّر قبل ما يتغيّر، وبعدين انشر. شغّل نفس الأمر مرتين.",
      v: "what-if بيطلّع موردين بعلامة Create. المرة التانية من النشر مش بتغيّر حاجة: ده معنى idempotent.",
      h: "`az deployment group what-if` و `az deployment group create` بياخدوا نفس الفلاجات.",
      c: `az deployment group what-if -g $RG -f main.bicep
az deployment group create -g $RG -n platform -f main.bicep
APP=$(az deployment group show -g $RG -n platform --query properties.outputs.name.value -o tsv)
URL=$(az deployment group show -g $RG -n platform --query properties.outputs.url.value -o tsv)
echo $APP $URL` },
    { t: "ارفع المنصة",
      d: "اعمل zip للملفات الثابتة وارفعه. افتح الـ URL.",
      v: "المنصة فاتحة على `azurewebsites.net`. التقدم فاضي لأن الـ localStorage مربوط بالدومين: انقله من «بياناتي».",
      h: "`az webapp deploy --type zip`. الملفات لازم تكون في جذر الـ zip مش جوه فولدر.",
      c: `python3 build.py
zip -r site.zip index.html assets data
az webapp deploy -g $RG -n $APP --src-path site.zip --type zip
curl -sI $URL | head -n 1` },
    { t: "اتأكد من الإعدادات الأمنية",
      d: "اطلب الموقع بـ HTTP وشوف التحويل، واتأكد من الـ TLS والـ FTP من الـ CLI.",
      v: "HTTP بيرجّع 301 لـ HTTPS، والإعدادات زي ما في الـ Bicep.",
      h: "`az webapp show` فيه `httpsOnly`، و `az webapp config show` فيه `minTlsVersion` و `ftpsState`.",
      c: `curl -sI \${URL/https/http} | head -n 3
az webapp show -g $RG -n $APP --query httpsOnly
az webapp config show -g $RG -n $APP --query "{tls:minTlsVersion,ftps:ftpsState}"` },
    { t: "كبّر الـ plan من الـ Bicep",
      d: "الـ slots محتاجة Standard. ماتغيّرش من الـ portal: شغّل نفس الملف بـ `sku=S1` وشوف what-if الأول.",
      v: "what-if بيطلّع تعديل واحد على الـ plan (Modify) والـ web app من غير تغيير.",
      h: "`-p sku=S1`. ده scale up (حجم أكبر)، غير scale out (نسخ أكتر).",
      c: `az deployment group what-if -g $RG -f main.bicep -p sku=S1
az deployment group create -g $RG -n platform -f main.bicep -p sku=S1` },
    { t: "جرّب تحديث على staging واعمل swap",
      d: "اعمل slot اسمه `staging`، غيّر حاجة ظاهرة في المنصة (مثلاً الـ title)، ارفعها على الـ staging بس، راجعها، وبعدين swap.",
      v: "قبل الـ swap: التغيير على رابط `-staging` بس. بعده: على الإنتاج، والنسخة القديمة بقت في الـ staging.",
      h: "الـ swap بيبدّل الـ slots بعد ما الـ staging يسخن، فمفيش توقف. والرجوع هو swap تاني.",
      c: `az webapp deployment slot create -g $RG -n $APP --slot staging
sed -i 's/سحابة Study Lab/سحابة Study Lab v2/' build.py && python3 build.py
zip -r site-v2.zip index.html assets data
az webapp deploy -g $RG -n $APP --slot staging --src-path site-v2.zip --type zip

STG=$(az webapp show -g $RG -n $APP --slot staging --query defaultHostName -o tsv)
curl -s https://$STG | grep -o "<title>.*</title>"
curl -s $URL | grep -o "<title>.*</title>"

az webapp deployment slot swap -g $RG -n $APP --slot staging --target-slot production
curl -s $URL | grep -o "<title>.*</title>"
git checkout build.py index.html` },
    { t: "اقفل الموقع على IP بتاعك",
      d: "ضيف access restriction تسمح بـ IP بتاعك بس، وافتح الموقع من نت الموبايل.",
      v: "من الموبايل: 403 Forbidden. من جهازك: شغال.",
      h: "أول ما تضيف rule سماح، بيتضاف deny all ضمني في الآخر.",
      c: `MYIP=$(curl -s https://api.ipify.org)   # شغّله من جهازك مش من Cloud Shell
az webapp config access-restriction add -g $RG -n $APP --rule-name me --action Allow \\
  --ip-address $MYIP/32 --priority 100
az webapp config access-restriction show -g $RG -n $APP -o table` },
    { t: "صدّر الـ RG وقارنه بملفك",
      d: "صدّر الـ resource group كـ ARM template وحوّله لـ Bicep وقارنه بالملف اللي كتبته.",
      v: "الملف المتصدّر أطول بكتير وفيه قيم ثابتة. ده ليه الـ export نقطة بداية مش ملف نهائي.",
      h: "`az group export` وبعدين `az bicep decompile`.",
      c: `az group export -g $RG > exported.json
az bicep decompile --file exported.json
wc -l main.bicep exported.bicep` },
    { t: "ارجع للـ F1",
      d: "الـ S1 بيتحاسب بالساعة. امسح الـ slot وارجع F1 من نفس الملف.",
      v: "`az appservice plan list -g $RG --query \"[].sku.name\"` بيطلّع F1.",
      h: "الـ F1 مش بيدعم slots، فالرجوع بيفشل طول ما الـ slot موجود.",
      c: `az webapp deployment slot delete -g $RG -n $APP --slot staging
az deployment group create -g $RG -n platform -f main.bicep -p sku=F1` }
  ],
  brk: { t: "Complete mode",
    d: "اعمل نسخة من الملف وشيل منها الـ web app. شغّل what-if عليها بـ `--mode Complete` (what-if بس، ماتنشرش). إيه اللي هيحصل للـ web app؟ وإيه اللي كان هيحصل في الـ Incremental؟",
    h: "الـ Incremental (الافتراضي) بيسيب أي مورد مش مذكور في الملف. الـ Complete بيمسحه.",
    c: `sed '/^resource app/,/^}/d; /^output/d' main.bicep > plan-only.bicep
az deployment group what-if -g $RG -f plan-only.bicep --mode Complete
# النتيجة: Delete على الـ web app. ماتشغّلش create بالـ mode ده.` },
  clean: { d: "لو عايز تسيب المنصة شغالة، سيبها على F1 (مجاني). غير كده امسح الـ RG.",
    c: `az group delete -n rg-lab-07 --yes --no-wait` },
  explain: ["الفرق بين ARM template و Bicep، وبين Incremental و Complete", "what-if بيفيدك في إيه", "الفرق بين scale up و scale out في App Service", "الـ swap بيحصل إزاي، وإيه الإعدادات اللي بتفضل لازقة في الـ slot", "أنهي features محتاجة أنهي tier (slots، custom domain، autoscale، backup)"],
  refs: [["Bicep overview", "https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview"], ["Deployment slots", "https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots"]] },

/* ───────── 08 ───────── */
{ id: "lab08", grp: "AZ-500 · SC-200", track: "SC-200", log: "SOC L1", lvl: "متوسط", time: "ساعتين + يوم أو اتنين جمع داتا", cost: "Sentinel trial 31 يوم · VM صغيرة", secs: ["5.1", "4.2"],
  t: "Honeypot و SOC صغير على Sentinel", en: "SSH honeypot with Microsoft Sentinel detections",
  scn: "أنت SOC analyst. VM عليها SSH مفتوح للإنترنت، والبوتات هتبدأ تخبّط عليها خلال دقايق. المطلوب: تجمع المحاولات، تعرف جاية منين، تعمل detection rule بتفتح incident، وتحقق في incident كامل.",
  goal: "تشتغل على SIEM حقيقي بداتا هجوم حقيقية: جمع، KQL، analytics rules، incidents، و automation. ده أقرب مشروع لشغل SOC L1 و SC-200.",
  arch: `Internet (bots) ──22──► vm-honey   (key only, isolated VNet, no identity)
                           │ Azure Monitor Agent + DCR (Syslog: auth, authpriv)
                           ▼
                  Log Analytics workspace  law-soc
                           │
                   Microsoft Sentinel
                    ├─ Analytics rule: SSH brute force  → Incident (T1110)
                    ├─ Workbook: source map
                    └─ Automation rule: owner + severity`,
  need: ["الـ honeypot لازم يفضل معزول: VNet لوحده، مفيش peering، مفيش managed identity، ومفيش أي داتا حقيقية عليه", "الدخول بـ SSH key بس. ماتفعّلش الباسورد"],
  setup: `RG=rg-lab-08
LOC=westeurope
az group create -n $RG -l $LOC
az monitor log-analytics workspace create -g $RG -n law-soc -l $LOC`,
  steps: [
    { t: "فعّل Sentinel على الـ workspace",
      d: "ضيف Microsoft Sentinel على `law-soc`. أول 31 يوم فيهم 10GB في اليوم مجاناً للـ workspace الجديد.",
      v: "الـ workspace ظاهر في Microsoft Sentinel. تقدر تشتغل من Azure portal أو من Defender portal.",
      h: "Sentinel طبقة فوق Log Analytics: نفس الجداول ونفس الـ KQL. Microsoft معلنة إن Sentinel هيبقى في Defender portal بس بعد 31 مارس 2027، فاتعوّد عليه من دلوقتي.",
      c: `Portal:
Microsoft Sentinel > + Create > اختار law-soc > Add` },
    { t: "اعمل الـ honeypot",
      d: "VM لينكس بـ public IP و SSH مفتوح لكل الإنترنت، بـ key بس.",
      v: "`az vm show -d -g $RG -n vm-honey --query publicIps` بيطلّع IP، و `ssh azureuser@IP` بيدخّلك.",
      h: "`--nsg-rule SSH` بيفتح 22 للكل. ده غلط في أي VM حقيقية، وهنا مقصود.",
      c: `az vm create -g $RG -n vm-honey --image Ubuntu2204 --size Standard_B1s \\
  --public-ip-sku Standard --nsg-rule SSH --admin-username azureuser --generate-ssh-keys
az vm show -d -g $RG -n vm-honey --query publicIps -o tsv` },
    { t: "اجمع الـ auth logs",
      d: "اعمل data collection rule تجمع Syslog للـ facilities `auth` و `authpriv` من الـ VM للـ workspace.",
      v: "بعد 10 لـ 15 دقيقة: `Syslog | where Facility in (\"auth\",\"authpriv\") | take 20` بيرجّع محاولات من IPs متعرفهاش.",
      h: "نفس اللي عملته في مشروع 5، بس data source واحد.",
      c: `Portal:
Monitor > Data Collection Rules > Create
  Name: dcr-honey     Platform: Linux
  Resources:  vm-honey
  Data source: Linux Syslog > auth و authpriv عند LOG_INFO (والباقي None)
  Destination: Azure Monitor Logs > law-soc` },
    { t: "حلّل المحاولات بـ KQL",
      d: "اكتب queries تجاوب: كام محاولة في الساعة؟ أكتر 10 IPs؟ أكتر usernames اتجرّبت؟ ومن أنهي دول؟",
      v: "عندك 4 queries شغالين ومحفوظين. سيب الـ VM يوم وارجع شوف الأرقام.",
      h: "`parse` بيطلّع الـ user والـ IP من نص الرسالة. و `geo_info_from_ip_address()` بيرجّع الدولة.",
      c: `// شغّل الـ let مع query واحد من الأربعة في كل مرة
let fails = Syslog
| where Facility in ("auth", "authpriv") and SyslogMessage has "Invalid user"
| parse SyslogMessage with * "Invalid user " user " from " ip " port " *;

fails | summarize attempts = count() by bin(TimeGenerated, 1h) | render timechart

fails | summarize attempts = count() by ip | top 10 by attempts

fails | summarize attempts = count() by user | top 20 by attempts

fails
| extend country = tostring(geo_info_from_ip_address(ip).country)
| summarize attempts = count() by country | order by attempts desc` },
    { t: "اعمل analytics rule",
      d: "Scheduled rule: لو IP واحد عمل أكتر من 20 محاولة فاشلة في 10 دقايق، افتح incident. اربط الـ IP كـ entity وحط الـ MITRE technique.",
      v: "بعد شوية بيظهر incident في Incidents وفيه الـ IP كـ entity.",
      h: "الـ entity mapping هو اللي بيخلّي الـ incident قابل للتحقيق والربط بغيره. Brute Force رقمه T1110.",
      c: `Portal:
Microsoft Sentinel > Analytics > + Create > Scheduled query rule
  Name: SSH brute force from single IP     Severity: Medium
  Tactics: Credential Access > T1110 Brute Force
  Query:
    Syslog
    | where Facility in ("auth", "authpriv") and SyslogMessage has "Invalid user"
    | parse SyslogMessage with * "Invalid user " user " from " ip " port " *
    | summarize attempts = count(), users = make_set(user, 20) by ip, Computer
    | where attempts > 20
  Entity mapping:  IP > Address = ip     Host > HostName = Computer
  Run query every 10 minutes     Lookup data from the last 10 minutes
  Incident settings: Enabled     Alert grouping: by IP entity, 5 hours` },
    { t: "حقق في incident",
      d: "افتح incident واحد واعمله triage كامل: مين المصدر؟ جرّب كام user؟ نجح يدخل؟ اكتب الخلاصة في تعليق واقفله بالتصنيف الصح.",
      v: "الـ incident مقفول بـ classification وتعليق فيه الأدلة.",
      h: "السؤال الأهم: هل فيه `Accepted` من نفس الـ IP؟ لو لأ، يبقى محاولة فاشلة.",
      c: `// هل الـ IP ده نجح يدخل؟
Syslog
| where Facility in ("auth", "authpriv") and SyslogMessage has "Accepted"
| parse SyslogMessage with * "Accepted " method " for " user " from " ip " port " *
| project TimeGenerated, user, ip, method

// الإقفال:
// مفيش Accepted من الـ IP  → Benign Positive - Suspicious but expected (honeypot)
// فيه Accepted من IP غريب → True Positive، واعزل الـ VM فوراً` },
    { t: "اكتشف الدخول الناجح",
      d: "دي القاعدة الأهم: دخول ناجح من IP مش بتاعك. اعملها rule بـ severity High وجرّبها بدخولك من شبكة تانية.",
      v: "دخولك من نت الموبايل فتح incident بـ High.",
      h: "اعمل watchlist فيها الـ IPs المعروفة واستثنيها بـ `_GetWatchlist()`. أو ابدأ بـ `where ip != \"x.x.x.x\"`.",
      c: `Syslog
| where Facility in ("auth", "authpriv") and SyslogMessage has "Accepted"
| parse SyslogMessage with * "Accepted " method " for " user " from " ip " port " *
| where ip !in ((_GetWatchlist('trusted_ips') | project SearchKey))
| project TimeGenerated, Computer, user, ip, method

// الـ watchlist:
// Sentinel > Watchlist > + New > Alias: trusted_ips > ارفع CSV فيه عمود ip > SearchKey: ip` },
    { t: "اعمل workbook و automation rule",
      d: "Workbook فيه خريطة بالمحاولات حسب الدولة و timechart. و automation rule بتعيّن أي incident جديد ليك وتحط tag اسمه `honeypot`.",
      v: "الـ workbook بيعرض الخريطة، والـ incident الجديد بيتفتح متعيّن ليك.",
      h: "الـ automation rule بتشتغل لحظة إنشاء الـ incident ومن غير Logic App.",
      c: `Portal:
Sentinel > Workbooks > + Add workbook > Edit > Add query (آخر query في خطوة 4)
  Visualization: Map     Location: country     Size by: attempts

Sentinel > Automation > + Create > Automation rule
  Trigger: When incident is created
  Actions: Assign owner = أنت  ,  Add tags = honeypot` }
  ],
  brk: { t: "مصدر الداتا سكت",
    d: "أخطر حاجة في SOC إن الـ logs تقف ومحدش يلاحظ. وقّف الـ agent على الـ honeypot. الـ brute force rule هتفضل ساكتة وده شكله «كله تمام». اعمل rule تنبّه لما `Syslog` من `vm-honey` يقف أكتر من 30 دقيقة.",
    h: "نفس فكرة الـ heartbeat في مشروع 5. خلّي الـ lookback أطول من مدة السكوت.",
    c: `# من جهازك:
ssh azureuser@<IP> "sudo systemctl stop azuremonitoragent"

// Scheduled rule: every 15 minutes, lookup 6 hours, Severity High
Syslog
| where Computer == "vm-honey"
| summarize last = max(TimeGenerated) by Computer
| where last < ago(30m)

# بعد ما تضرب:
ssh azureuser@<IP> "sudo systemctl start azuremonitoragent"` },
  clean: { d: "ماتسيبش الـ honeypot شغال أكتر من كام يوم. بعد الـ trial، الـ ingestion بيتحاسب.",
    c: `az group delete -n rg-lab-08 --yes --no-wait` },
  explain: ["الفرق بين SIEM و SOAR و XDR ومكان Sentinel فيهم", "الـ alert والـ incident والـ entity: كل واحد إيه", "ليه الـ entity mapping مهم", "True Positive و Benign Positive و False Positive", "ليه مراقبة صحة مصادر الداتا جزء من الـ detection", "ليه SSH مفتوح للإنترنت غلط، وإيه البدايل (Bastion، JIT، VPN)"],
  refs: [["Sentinel analytics rules", "https://learn.microsoft.com/en-us/azure/sentinel/scheduled-rules-overview"], ["Sentinel billing and trial", "https://learn.microsoft.com/en-us/azure/sentinel/billing"]] },

/* ───────── 09 ───────── */
{ id: "lab09", grp: "AZ-500 · SC-200", track: "AZ-500", log: "AZ-500", lvl: "متقدم", time: "3–4 ساعات", cost: "ACR Basic باليوم · Container Apps شبه مجاني", secs: ["3.3", "1.2"],
  t: "DevSecOps pipeline لمصروفي من غير أي سر متخزّن", en: "Secure CI/CD: OIDC, image scanning, Key Vault and managed identity",
  scn: "عايز كل push على `main` في مصروفي يتبني ويتفحص ويتنشر لوحده. الشروط: مفيش أي password أو key متخزّن في GitHub، الـ pipeline يقف لو فيه سر في الكود أو ثغرة عالية في الـ image، والتطبيق يقرا أسراره من Key Vault بهويته.",
  goal: "تبني الـ pipeline اللي بيتسأل عنها في أي مقابلة DevSecOps: federated identity، secret scanning، image scanning، least privilege، و Key Vault references.",
  arch: `git push ──► GitHub Actions
               ├─ gitleaks        (secrets in code)
               ├─ npm audit       (dependencies)
               ├─ docker build
               ├─ trivy           (image CVEs)  ✗ fails on HIGH/CRITICAL
               ├─ azure/login     (OIDC, no stored secret)
               ├─ push ──► Azure Container Registry
               └─ deploy ─► Container App  ca-masrofy
                               ├─ system identity ── AcrPull ──► ACR
                               └─ system identity ── Key Vault Secrets User ──► Key Vault`,
  need: ["repo مصروفي على GitHub وصلاحية admin عليه", "Docker على جهازك لو `az acr build` مش مسموح في اشتراكك"],
  setup: `RG=rg-lab-09
LOC=westeurope
ACR=acrlab$RANDOM$RANDOM
KV=kv-lab-$RANDOM
REPO=baya3elward019/اسم-الريبو     # غيّره
SUB=$(az account show --query id -o tsv)
az group create -n $RG -l $LOC
RG_ID=$(az group show -n $RG --query id -o tsv)
echo $ACR $KV`,
  steps: [
    { t: "اكتب Dockerfile آمن",
      d: "Multi-stage: مرحلة بتبني بـ Node ومرحلة بتشغّل بـ nginx كـ non-root على بورت 8080. ضيف `.dockerignore`.",
      v: "`docker build -t masrofy:dev . && docker run -p 8080:8080 masrofy:dev` بيفتح التطبيق على localhost.",
      h: "الـ image النهائية مفيهاش Node ولا الـ source. استخدم `nginxinc/nginx-unprivileged` عشان مايشتغلش كـ root.",
      c: `cat > Dockerfile <<'EOF'
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
EOF
printf "node_modules\\ndist\\n.git\\n.env*\\n" > .dockerignore` },
    { t: "اعمل registry وارفع أول image",
      d: "ACR بـ SKU Basic والـ admin user مقفول. ابني الـ image وارفعها.",
      v: "`az acr repository show-tags -n $ACR --repository masrofy` بيطلّع `v1`.",
      h: "`az acr build` بيبني في السحابة. لو رجّع `TasksOperationsNotAllowed` ابني محلي واعمل push.",
      c: `az acr create -g $RG -n $ACR --sku Basic --admin-enabled false
az acr build -r $ACR -t masrofy:v1 .

# البديل لو ACR Tasks مش مسموحة:
az acr login -n $ACR
docker build -t $ACR.azurecr.io/masrofy:v1 . && docker push $ACR.azurecr.io/masrofy:v1` },
    { t: "شغّله على Container Apps بـ managed identity",
      d: "اعمل environment و container app بيسحب الـ image من الـ ACR بهوية النظام (من غير username و password)، وبينزل لصفر نسخ لما مفيش ترافيك.",
      v: "الـ FQDN بيفتح مصروفي. و `az role assignment list --scope` على الـ ACR فيه AcrPull لهوية التطبيق.",
      h: "`--registry-identity system` بيعمل الهوية وبيدّيها AcrPull لوحده.",
      c: `az containerapp env create -g $RG -n cae-lab -l $LOC
az containerapp create -g $RG -n ca-masrofy --environment cae-lab \\
  --image $ACR.azurecr.io/masrofy:v1 --target-port 8080 --ingress external \\
  --registry-server $ACR.azurecr.io --registry-identity system \\
  --min-replicas 0 --max-replicas 2
az containerapp show -g $RG -n ca-masrofy --query properties.configuration.ingress.fqdn -o tsv` },
    { t: "خزّن سر في Key Vault واقراه بهوية التطبيق",
      d: "Key Vault بنموذج RBAC. حط فيه سر، ادّي هوية التطبيق Key Vault Secrets User، واربط السر كـ environment variable عن طريق Key Vault reference. (مصروفي واجهة بس ومش محتاج سر فعلاً، الهدف هنا الآلية.)",
      v: "`az containerapp secret list` بيطلّع السر ومصدره Key Vault، وقيمته مش مكتوبة في أي مكان في إعدادات التطبيق.",
      h: "حتى لو أنت Owner، محتاج data role على الـ vault عشان تكتب سر. ودي نفس فكرة الـ storage في مشروع 2.",
      c: `az keyvault create -g $RG -n $KV -l $LOC --enable-rbac-authorization true
KV_ID=$(az keyvault show -n $KV --query id -o tsv)
ME=$(az ad signed-in-user show --query id -o tsv)
az role assignment create --assignee-object-id $ME --assignee-principal-type User \\
  --role "Key Vault Secrets Officer" --scope $KV_ID
sleep 60
az keyvault secret set --vault-name $KV -n api-key --value "demo-$RANDOM"

APP_MI=$(az containerapp show -g $RG -n ca-masrofy --query identity.principalId -o tsv)
az role assignment create --assignee-object-id $APP_MI --assignee-principal-type ServicePrincipal \\
  --role "Key Vault Secrets User" --scope $KV_ID
sleep 60
az containerapp secret set -g $RG -n ca-masrofy \\
  --secrets "api-key=keyvaultref:https://$KV.vault.azure.net/secrets/api-key,identityref:system"
az containerapp update -g $RG -n ca-masrofy --set-env-vars API_KEY=secretref:api-key` },
    { t: "اربط GitHub بـ Azure بـ OIDC",
      d: "اعمل app registration و service principal، واعمل federated credential بيثق في الـ repo بتاعك على فرع `main` بس. ادّيه أقل صلاحيات: AcrPush على الـ registry و Container Apps Contributor على الـ RG.",
      v: "في الـ app registration مفيش أي client secret، وفيه federated credential واحد.",
      h: "الـ subject لازم يطابق بالحرف: `repo:OWNER/REPO:ref:refs/heads/main`.",
      c: `APP_ID=$(az ad app create --display-name gh-masrofy-deploy --query appId -o tsv)
az ad sp create --id $APP_ID
SP_OID=$(az ad sp show --id $APP_ID --query id -o tsv)

cat > fic.json <<EOF
{ "name": "gh-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:$REPO:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"] }
EOF
az ad app federated-credential create --id $APP_ID --parameters @fic.json

az role assignment create --assignee-object-id $SP_OID --assignee-principal-type ServicePrincipal \\
  --role AcrPush --scope $(az acr show -n $ACR --query id -o tsv)
az role assignment create --assignee-object-id $SP_OID --assignee-principal-type ServicePrincipal \\
  --role "Container Apps Contributor" --scope $RG_ID

echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID=$SUB"
# حطهم في GitHub: Settings > Secrets and variables > Actions > Variables (دي IDs مش أسرار)` },
    { t: "اكتب الـ workflow",
      d: "بالترتيب: فحص أسرار، فحص dependencies، build، فحص image، وبعد كده بس login و push و deploy. الـ tag هو الـ commit SHA.",
      v: "push على `main` بيشغّل الـ workflow، والـ container app بيشتغل على image بـ tag الـ commit.",
      h: "`permissions: id-token: write` هو اللي بيسمح للـ job تطلب OIDC token. من غيره الـ login بيفشل.",
      c: `mkdir -p .github/workflows && cat > .github/workflows/deploy.yml <<'EOF'
name: build-scan-deploy
on:
  push:
    branches: [main]
permissions:
  id-token: write
  contents: read
env:
  ACR: \${{ vars.ACR_NAME }}
  IMAGE: \${{ vars.ACR_NAME }}.azurecr.io/masrofy:\${{ github.sha }}
jobs:
  ship:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      - name: Dependency audit
        run: npm ci && npm audit --audit-level=high
      - name: Build image
        run: docker build -t "$IMAGE" .
      - name: Image scan
        uses: aquasecurity/trivy-action@COMMIT_SHA   # ثبّت كل action على commit SHA كامل
        with:
          image-ref: \${{ env.IMAGE }}
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: '1'
      - name: Azure login (OIDC)
        uses: azure/login@v2
        with:
          client-id: \${{ vars.AZURE_CLIENT_ID }}
          tenant-id: \${{ vars.AZURE_TENANT_ID }}
          subscription-id: \${{ vars.AZURE_SUBSCRIPTION_ID }}
      - name: Push
        run: az acr login -n "$ACR" && docker push "$IMAGE"
      - name: Deploy
        run: az containerapp update -g rg-lab-09 -n ca-masrofy --image "$IMAGE"
EOF
# ضيف كمان variable اسمه ACR_NAME وقيمته اسم الـ registry` },
    { t: "اقفل الـ repo نفسه",
      d: "الـ pipeline الآمن مالوش قيمة لو أي حد يقدر يعمل push على `main`. فعّل branch protection (PR + status check)، و Dependabot، و secret scanning مع push protection.",
      v: "push مباشر على `main` بيترفض، والـ PR مايتعملوش merge غير لما الـ workflow يعدّي.",
      h: "كل ده من Settings في الـ repo. الـ secret scanning مجاني للـ public repos.",
      c: `GitHub:
Settings > Rules > Rulesets > New branch ruleset (main)
   Require a pull request before merging
   Require status checks to pass > ship
Settings > Advanced Security
   Dependabot alerts + security updates
   Secret scanning + Push protection` }
  ],
  brk: { t: "خلّي الـ pipeline يفشل 3 مرات",
    d: "(1) اعمل فرع وحط فيه ملف فيه مفتاح شكله حقيقي وشوف gitleaks. (2) غيّر الـ base image لـ `nginx:1.18` وشوف trivy. (3) غيّر الـ `subject` في الـ federated credential لفرع تاني وشوف رسالة الـ login. لكل واحدة: اقرا الـ log واكتب إيه اللي اتمنع.",
    h: "التالتة بترجّع AADSTS error معناه إن مفيش federated identity مطابق: الـ token جاي من فرع والـ credential واثق في فرع تاني.",
    c: `# 1) سر في الكود (قيمة عشوائية مش مفتاح حقيقي)
git checkout -b test/leak && echo "api_key = '$(openssl rand -hex 20)'" > leak.txt
git add leak.txt && git commit -m "test leak" && git push -u origin test/leak   # وافتح PR

# 2) image قديمة
sed -i 's#nginxinc/nginx-unprivileged:stable-alpine#nginx:1.18#' Dockerfile

# 3) subject غلط
az ad app federated-credential update --id $APP_ID --federated-credential-id gh-main \\
  --parameters '{"name":"gh-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:'$REPO':ref:refs/heads/other","audiences":["api://AzureADTokenExchange"]}'
# النتيجة: azure/login بيفشل: No matching federated identity record found
# رجّع الـ subject لـ main بعدها` },
  clean: { d: "الـ app registration مش جوه الـ RG، فلازم يتمسح لوحده. والـ Key Vault بيفضل soft-deleted فامسحه نهائي لو عايز نفس الاسم.",
    c: `az group delete -n rg-lab-09 --yes
az ad app delete --id $APP_ID
az keyvault purge -n $KV` },
  explain: ["الـ OIDC federation شغال إزاي وليه أأمن من client secret", "الفرق بين managed identity و service principal و app registration", "ليه الفحص قبل الـ login والـ push مش بعدهم", "الفرق بين Key Vault access policies و RBAC", "ليه تثبّت الـ actions على commit SHA (supply chain)", "SAST و SCA و secret scanning و image scanning: كل واحد بيمسك إيه"],
  refs: [["GitHub OIDC with Azure", "https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect"], ["Container Apps secrets", "https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets"]] },

/* ───────── 10 ───────── */
{ id: "lab10", grp: "AZ-500 · SC-200", track: "IoT Security", log: "إلكترونيات / IoT", lvl: "متقدم", time: "3 ساعات", cost: "مجاني (IoT Hub F1)", secs: [],
  t: "ESP32 بيكلّم Azure بشهادة X.509", en: "ESP32 to IoT Hub with certificate authentication and monitoring",
  scn: "الـ ESP32 بيبعت قراءات الحساس للسحابة. مفيش passwords ولا shared keys على الجهاز: كل جهاز له شهادة، ولو جهاز اتسرق تقدر تقفله لوحده من غير ما تلمس الباقي، وأي محاولة اتصال مرفوضة بتتسجّل.",
  goal: "تربط الـ mechatronics بالـ cloud security: هوية لكل جهاز، mutual TLS، إلغاء جهاز، ومراقبة الاتصالات.",
  arch: `ESP32 (device.crt + device.key)
   │  MQTT over TLS 1.2 :8883   (mutual TLS)
   ▼
IoT Hub (F1)  ── device identity: esp32-robot  (x509 thumbprint)
   ├─ built-in endpoint ──► az iot hub monitor-events
   └─ diagnostic setting (Connections) ──► Log Analytics ──► KQL + alert`,
  need: ["ESP32 و Arduino IDE ومكتبة PubSubClient", "`openssl` و `mosquitto-clients` على جهازك للاختبار قبل الـ ESP32", "اشتراك مفيهوش IoT Hub مجاني تاني (واحد F1 بس لكل اشتراك)"],
  setup: `RG=rg-lab-10
LOC=westeurope
HUB=iot-lab-$RANDOM
DEV=esp32-robot
az extension add --name azure-iot --upgrade
az group create -n $RG -l $LOC`,
  steps: [
    { t: "اعمل IoT Hub مجاني",
      d: "اعمل hub بـ SKU F1. فيه حد يومي للرسايل وده كفاية للتجربة.",
      v: "`az iot hub show -n $HUB --query properties.hostName -o tsv` بيطلّع اسم بينتهي بـ `azure-devices.net`.",
      h: "الـ F1 محتاج `--partition-count 2`.",
      c: `az iot hub create -g $RG -n $HUB --sku F1 --partition-count 2 -l $LOC
HOST=$(az iot hub show -n $HUB --query properties.hostName -o tsv); echo $HOST` },
    { t: "اعمل شهادة للجهاز",
      d: "اعمل private key وشهادة self-signed الـ CN بتاعها هو اسم الجهاز، وطلّع الـ thumbprint.",
      v: "عندك `device.key` و `device.crt` و thumbprint من 40 حرف hex.",
      h: "الـ private key مايطلعش من جهازك غير للـ ESP32. اللي بيتسجّل في Azure هو الـ thumbprint بس.",
      c: `openssl req -x509 -newkey rsa:2048 -nodes -keyout device.key -out device.crt \\
  -days 365 -subj "/CN=$DEV"
FP=$(openssl x509 -in device.crt -noout -fingerprint | cut -d= -f2 | tr -d ':'); echo $FP` },
    { t: "سجّل الجهاز بالـ thumbprint",
      d: "اعمل device identity طريقة التوثيق بتاعتها `x509_thumbprint`.",
      v: "`az iot hub device-identity show -n $HUB -d $DEV --query authentication.type` بيطلّع `selfSigned`.",
      h: "فيه primary و secondary thumbprint عشان تقدر تبدّل الشهادة من غير ما الجهاز يقع.",
      c: `az iot hub device-identity create -n $HUB -d $DEV --am x509_thumbprint --ptp $FP --stp $FP` },
    { t: "جرّب الاتصال من جهازك الأول",
      d: "قبل الـ ESP32، ابعت رسالة بـ `mosquitto_pub` بنفس الشهادة، وراقب الـ hub في terminal تاني. كده لو الـ ESP32 مش شغال تعرف إن المشكلة في الكود مش في Azure.",
      v: "الرسالة بتظهر في `monitor-events`.",
      h: "الـ username هو `HOST/DEVICE/?api-version=2021-04-12` ومفيش password. الـ topic هو `devices/DEVICE/messages/events/`.",
      c: `curl -s https://cacerts.digicert.com/DigiCertGlobalRootG2.crt.pem -o root.pem

# terminal 1
az iot hub monitor-events -n $HUB -d $DEV

# terminal 2
mosquitto_pub -h $HOST -p 8883 -V mqttv311 -i $DEV \\
  -u "$HOST/$DEV/?api-version=2021-04-12" \\
  --cafile root.pem --cert device.crt --key device.key \\
  -t "devices/$DEV/messages/events/" -m '{"distance_cm":42}'` },
    { t: "شغّله على الـ ESP32",
      d: "حط الـ root CA والشهادة والـ key في `secrets.h` واتصل بـ `WiFiClientSecure` و `PubSubClient`. الساعة لازم تتظبط بـ NTP قبل الـ TLS.",
      v: "قراءات الحساس بتظهر في `monitor-events` كل 10 ثواني.",
      h: "لو الاتصال بيفشل من غير سبب واضح، أغلب الوقت الساعة مش مظبوطة أو الـ root CA غلط.",
      c: `// secrets.h: WIFI_SSID, WIFI_PASS, ROOT_CA, DEVICE_CERT, DEVICE_KEY  (PEM كـ string) — وحطه في .gitignore
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "secrets.h"

const char* HUB = "YOUR-HUB.azure-devices.net";
const char* DEV = "esp32-robot";
WiFiClientSecure net;
PubSubClient mqtt(net);

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  configTime(0, 0, "pool.ntp.org");
  while (time(nullptr) < 1700000000) delay(300);   // TLS needs a correct clock
  net.setCACert(ROOT_CA);
  net.setCertificate(DEVICE_CERT);
  net.setPrivateKey(DEVICE_KEY);
  mqtt.setServer(HUB, 8883);
}

void loop() {
  if (!mqtt.connected()) {
    String user = String(HUB) + "/" + DEV + "/?api-version=2021-04-12";
    if (!mqtt.connect(DEV, user.c_str(), nullptr)) {
      Serial.println(mqtt.state()); delay(5000); return;
    }
  }
  mqtt.loop();
  static unsigned long last = 0;
  if (millis() - last > 10000) {
    last = millis();
    String body = "{\\"distance_cm\\":" + String(readDistance()) + "}";   // readDistance(): دالة الحساس بتاعتك
    mqtt.publish("devices/esp32-robot/messages/events/", body.c_str());
  }
}` },
    { t: "سجّل الاتصالات في Log Analytics",
      d: "اعمل workspace و diagnostic setting على الـ hub يبعت category الـ Connections. وبعدين اكتب KQL يعرض أحداث الاتصال والانقطاع.",
      v: "بعد ما تفصل وتوصّل الـ ESP32 ودقايق انتظار، الأحداث بتظهر في الـ query.",
      h: "أحداث الـ hub بتروح جدول `AzureDiagnostics`.",
      c: `az monitor log-analytics workspace create -g $RG -n law-iot -l $LOC
az monitor diagnostic-settings create -n iot-to-law \\
  --resource $(az iot hub show -n $HUB --query id -o tsv) \\
  --workspace $(az monitor log-analytics workspace show -g $RG -n law-iot --query id -o tsv) \\
  --logs '[{"category":"Connections","enabled":true}]'

AzureDiagnostics
| where ResourceProvider == "MICROSOFT.DEVICES" and Category == "Connections"
| project TimeGenerated, OperationName, Level, ResultDescription, properties_s
| order by TimeGenerated desc` },
    { t: "اقفل جهاز مسروق",
      d: "افترض إن الـ ESP32 اتسرق. عطّل الـ identity بتاعته وشوف إيه اللي بيحصل للاتصال.",
      v: "الجهاز بيتفصل ومحاولات الاتصال بتترفض، وبتظهر في الـ logs بـ Level = Error. باقي الأجهزة مش متأثرة.",
      h: "التعطيل بيقفل الجهاز من غير ما يمسحه، فتقدر ترجّعه.",
      c: `az iot hub device-identity update -n $HUB -d $DEV --set status=disabled
# ... راقب الـ Serial monitor والـ logs ...
az iot hub device-identity update -n $HUB -d $DEV --set status=enabled` },
    { t: "بدّل الشهادة من غير توقف",
      d: "اعمل شهادة جديدة، حطها كـ secondary thumbprint، ارفعها على الـ ESP32، وبعد ما يتصل بيها خلّيها primary وشيل القديمة.",
      v: "الجهاز شغال بالشهادة الجديدة، والقديمة بقت مرفوضة (جرّبها بـ `mosquitto_pub`).",
      h: "في فترة الانتقال الـ hub بيقبل الاتنين، وده سبب وجود thumbprint تاني.",
      c: `openssl req -x509 -newkey rsa:2048 -nodes -keyout device2.key -out device2.crt -days 365 -subj "/CN=$DEV"
FP2=$(openssl x509 -in device2.crt -noout -fingerprint | cut -d= -f2 | tr -d ':')
az iot hub device-identity update -n $HUB -d $DEV --ptp $FP --stp $FP2     # الاتنين مقبولين
# ... ارفع device2 على الـ ESP32 واتأكد إنه اتصل ...
az iot hub device-identity update -n $HUB -d $DEV --ptp $FP2 --stp $FP2    # القديمة اتلغت` }
  ],
  brk: { t: "اسرق هوية الجهاز",
    d: "افترض إنك المهاجم ومعاك الـ ESP32 في إيدك. الـ private key متخزّن في الـ flash كنص. حاول تقراه بـ `esptool`، واكتب: إيه اللي المهاجم يقدر يعمله بيه؟ وإزاي تصعّبها؟",
    h: "اقرا الـ flash كله ودوّر على `BEGIN` جوه الملف. الحلول على مستويين: الجهاز (flash encryption، secure boot، secure element) والسحابة (تعطيل وتبديل سريع، ومراقبة).",
    c: `# اقرا 4MB من الـ flash ودوّر على المفتاح
esptool.py --port /dev/ttyUSB0 read_flash 0 0x400000 dump.bin
strings dump.bin | grep -A 3 "BEGIN"

# اللي المهاجم يقدر يعمله: ينتحل الجهاز ده بس ويبعت قراءات مزوّرة باسمه
# اللي مايقدرش يعمله: يوصل لأجهزة تانية أو لإدارة الـ hub

# التصعيب:
#   على الجهاز:  ESP32 flash encryption + secure boot ، أو مفتاح في secure element زي ATECC608
#   في السحابة:  شهادة لكل جهاز ، تعطيل فوري ، alert على اتصال من IP غير متوقع` },
  clean: { d: "الـ F1 مجاني، بس امسحه لو مش هتستخدمه عشان يفضل متاح لمشروع تاني.",
    c: `az group delete -n rg-lab-10 --yes --no-wait
rm -f device*.key device*.crt` },
  explain: ["الـ mutual TLS: مين بيثبت هويته لمين وبإيه", "الفرق بين symmetric key و X.509 self-signed و X.509 CA-signed في IoT Hub", "ليه هوية لكل جهاز أحسن من سر مشترك", "ليه الـ private key على microcontroller مشكلة، وإيه حلولها", "إزاي تلغي جهاز واحد من غير ما تأثر على الباقي"],
  refs: [["IoT Hub MQTT", "https://learn.microsoft.com/en-us/azure/iot/iot-mqtt-connect-to-iot-hub"], ["ESP32 flash encryption", "https://docs.espressif.com/projects/esp-idf/en/stable/esp32/security/flash-encryption.html"]] }
);
