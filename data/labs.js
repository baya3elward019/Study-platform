/* مشاريع عملية على Azure — المشاريع 1 إلى 5 (مسار AZ-104).
   كل مشروع: السيناريو، المعمارية، خطوات كـ checklist، تلميح وحل لكل خطوة، مهمة «اكسره وصلّحه»، والتنظيف.
   secs: أقسام AZ-104 اللي المشروع بيغطيها (بتربطه بأسئلة البنك).
   في النصوص: `كود` بين backticks بيتعرض ككود. في c (الحل): اكتب \\ بدل \ و \${ بدل ${.
   الأوامر مكتوبة لـ Azure Cloud Shell (Bash). راجعها على Microsoft Learn لو الـ CLI اتغيّر. */
window.SAHABA_LABS = [

/* ───────── 01 ───────── */
{ id: "lab01", grp: "AZ-104", track: "AZ-104", log: "AZ-104", lvl: "مبتدئ", time: "60–90 دقيقة", cost: "مجاني", secs: ["1.1", "1.2", "1.3"],
  t: "حوكمة الاشتراك: مين يعمل إيه وفين", en: "Subscription governance, RBAC and Azure Policy",
  scn: "شركة صغيرة فتحت اشتراك Azure ومفيش أي ضوابط. مطلوب منك: فريق تشغيل يقدر يشغّل ويطفي الـ VMs بس، كل الموارد في region واحد وعليها tag، ومفيش حد يمسح resource group الإنتاج بالغلط، وتنبيه لو الفاتورة قربت من الحد.",
  goal: "تطبّق الـ RBAC على scopes مختلفة، تكتب custom role، وتفرض قواعد بـ Azure Policy و resource locks. ده أول مشروع لأنه بيحميك في كل المشاريع اللي بعده.",
  arch: `Tenant (Microsoft Entra ID)
 └─ Management group: mg-lab            (optional)
     └─ Subscription                    ← Budget + alerts
         └─ rg-lab-01   tags: env=lab   ← Lock: CanNotDelete
              ├─ Role: Reader            → grp-lab-ops
              ├─ Role: Lab VM Operator   → grp-lab-ops   (custom)
              ├─ Policy: Allowed locations
              └─ Policy: Require a tag on resources (env)`,
  need: ["صلاحية Owner على الاشتراك", "صلاحية إنشاء مستخدمين في الـ tenant (User Administrator أو أعلى)"],
  setup: `RG=rg-lab-01
LOC=westeurope
SUB=$(az account show --query id -o tsv)
DOMAIN=$(az rest --method get --url https://graph.microsoft.com/v1.0/domains --query "value[?isDefault].id" -o tsv)
echo $SUB $DOMAIN`,
  steps: [
    { t: "اعمل Budget بتنبيهات",
      d: "قبل أي مورد: ميزانية شهرية صغيرة على الاشتراك بتنبيه عند 50% و 80% و 100%. خلّيها أول حاجة تعملها في أي اشتراك.",
      v: "الـ budget ظاهر في Cost Management وإيميلك مكتوب في التنبيهات.",
      h: "الـ budget بينبّه بس ومش بيوقف الصرف. لو عايز إجراء أوتوماتيك لازم تربطه بـ action group.",
      c: `Portal:
Cost Management + Billing > Cost Management > Budgets > Add
  Scope:        الاشتراك
  Reset period: Monthly
  Amount:       رقم صغير يناسبك
  Alerts:       Actual 50% , Actual 80% , Forecasted 100%  + إيميلك` },
    { t: "اعمل group ومستخدم تجريبي",
      d: "اعمل security group اسمه `grp-lab-ops` ومستخدم `labop` وضيفه للجروب. الصلاحيات هتتدّى للجروب مش للمستخدم.",
      v: "`az ad group member list --group grp-lab-ops -o table` بيطلّع المستخدم.",
      h: "`az ad group create` محتاج `--mail-nickname`. والمستخدم محتاج UPN بدومين الـ tenant.",
      c: `az ad group create --display-name grp-lab-ops --mail-nickname grp-lab-ops
PW="Lab-$RANDOM-$RANDOM-Az!"; echo "password: $PW"
az ad user create --display-name "Lab Operator" \\
  --user-principal-name labop@$DOMAIN --password "$PW"
az ad group member add --group grp-lab-ops \\
  --member-id $(az ad user show --id labop@$DOMAIN --query id -o tsv)
GID=$(az ad group show --group grp-lab-ops --query id -o tsv)` },
    { t: "اعمل resource group بـ tags",
      d: "اعمل `rg-lab-01` وعليه `env=lab` و `owner=baya3`. لاحظ إن الـ tags على الـ RG مش بتتورّث للموارد اللي جواه لوحدها.",
      v: "`az group show -n rg-lab-01 --query tags`",
      h: "`az group create` بياخد `--tags key=value key=value`.",
      c: `az group create -n $RG -l $LOC --tags env=lab owner=baya3
RG_ID=$(az group show -n $RG --query id -o tsv)` },
    { t: "ادّي الجروب Reader على الـ RG بس",
      d: "اعمل role assignment للجروب بدور Reader والـ scope هو الـ resource group، مش الاشتراك.",
      v: "افتح نافذة private وسجّل دخول بـ `labop`: هيشوف `rg-lab-01` بس، ومش هيقدر ينشئ حاجة.",
      h: "للجروبات استخدم `--assignee-object-id` مع `--assignee-principal-type Group`.",
      c: `az role assignment create --assignee-object-id $GID \\
  --assignee-principal-type Group --role Reader --scope $RG_ID
az role assignment list --scope $RG_ID -o table` },
    { t: "اكتب custom role لتشغيل الـ VMs",
      d: "دور اسمه `Lab VM Operator` يسمح بـ read و start و restart و deallocate للـ VMs، من غير إنشاء أو مسح. عيّنه للجروب على الـ RG.",
      v: "`az role definition list --custom-role-only true -o table` بيطلّع الدور. (هتجرّبه فعلياً في مشروع 5 لما يبقى عندك VM.)",
      h: "الدور ملف JSON فيه Actions و NotActions و AssignableScopes. الدور الجديد ممكن ياخد دقيقتين قبل ما يتعيّن.",
      c: `cat > vm-operator.json <<EOF
{
  "Name": "Lab VM Operator",
  "Description": "Start, restart and deallocate VMs. No create, no delete.",
  "Actions": [
    "Microsoft.Compute/virtualMachines/read",
    "Microsoft.Compute/virtualMachines/start/action",
    "Microsoft.Compute/virtualMachines/restart/action",
    "Microsoft.Compute/virtualMachines/deallocate/action",
    "Microsoft.Resources/subscriptions/resourceGroups/read"
  ],
  "NotActions": [],
  "AssignableScopes": ["/subscriptions/$SUB"]
}
EOF
az role definition create --role-definition @vm-operator.json
az role assignment create --assignee-object-id $GID \\
  --assignee-principal-type Group --role "Lab VM Operator" --scope $RG_ID` },
    { t: "امنع أي region غير المسموح",
      d: "عيّن الـ built-in policy «Allowed locations» على الـ RG وخلّي المسموح `westeurope` بس. بعدها حاول تنشئ storage account في `northeurope`.",
      v: "الإنشاء بيفشل بـ `RequestDisallowedByPolicy`. الـ policy ممكن تاخد من 5 لـ 15 دقيقة لحد ما تشتغل.",
      h: "هات اسم الـ definition بالـ displayName بدل ما تحفظ الـ GUID.",
      c: `DEF=$(az policy definition list --query "[?displayName=='Allowed locations'].name" -o tsv)
az policy assignment create --name lab-allowed-loc --policy $DEF --scope $RG_ID \\
  --params '{"listOfAllowedLocations":{"value":["westeurope"]}}'

# الاختبار (المفروض يفشل)
az storage account create -n stpol$RANDOM -g $RG -l northeurope --sku Standard_LRS` },
    { t: "افرض tag على كل مورد",
      d: "عيّن «Require a tag on resources» بالـ tag `env`. جرّب تنشئ storage account من غير tag، وبعدين بـ `--tags env=lab`.",
      v: "من غير tag بيترفض، وبالـ tag بيتعمل.",
      h: "الـ effect هنا deny: بيمنع الجديد بس ومش بيصلّح القديم.",
      c: `DEF=$(az policy definition list --query "[?displayName=='Require a tag on resources'].name" -o tsv)
az policy assignment create --name lab-require-env --policy $DEF --scope $RG_ID \\
  --params '{"tagName":{"value":"env"}}'

az storage account create -n stnotag$RANDOM -g $RG -l $LOC --sku Standard_LRS            # يترفض
az storage account create -n sttag$RANDOM -g $RG -l $LOC --sku Standard_LRS --tags env=lab # يتعمل` },
    { t: "اقفل الـ RG ضد المسح",
      d: "حط lock من نوع CanNotDelete على الـ RG وحاول تمسحه وأنت Owner.",
      v: "`az group delete` بيفشل بـ `ScopeLocked`. الـ lock بيتطبق حتى على الـ Owner.",
      h: "فيه نوعين: CanNotDelete و ReadOnly. الـ ReadOnly بيمنع حتى `listKeys` على الـ storage account.",
      c: `az lock create --name lab-no-delete --lock-type CanNotDelete --resource-group $RG
az group delete -n $RG --yes   # المفروض يفشل` },
    { t: "اختياري: management group",
      d: "اعمل `mg-lab` وانقل الاشتراك تحته. أي policy أو role على الـ MG بيتورّث لكل الاشتراكات اللي تحته.",
      v: "`az account management-group show --name mg-lab --expand` بيطلّع الاشتراك كـ child.",
      h: "أول management group في الـ tenant ممكن ياخد لحد 15 دقيقة. لو اترفض، فعّل «Access management for Azure resources» من Entra ID ← Properties.",
      c: `az account management-group create --name mg-lab --display-name "Lab"
az account management-group subscription add --name mg-lab --subscription $SUB` }
  ],
  brk: { t: "من deny لـ modify",
    d: "المدير قال: مش عايز الناس تترفض، عايز الـ tag يتحط لوحده. بدّل «Require a tag» بـ «Inherit a tag from the resource group if missing». إيه اللي الـ assignment ده محتاجه زيادة عشان يشتغل؟ والـ storage account القديم هيتعدّل لوحده؟",
    h: "الـ modify effect بيغيّر الموارد، فمحتاج managed identity عليها role. والموارد الموجودة محتاجة remediation task.",
    c: `az policy assignment delete --name lab-require-env --scope $RG_ID
DEF=$(az policy definition list --query "[?displayName=='Inherit a tag from the resource group if missing'].name" -o tsv)
az policy assignment create --name lab-inherit-env --policy $DEF --scope $RG_ID \\
  --params '{"tagName":{"value":"env"}}' \\
  --mi-system-assigned --location $LOC --role "Tag Contributor" --identity-scope $RG_ID

# الموارد القديمة مش بتتصلّح غير بـ remediation
az policy remediation create --name fix-env -g $RG --policy-assignment lab-inherit-env` },
  clean: { d: "الـ lock لازم يتشال الأول، وإلا مسح الـ RG هيفشل.",
    c: `az lock delete --name lab-no-delete --resource-group $RG
az group delete -n $RG --yes
az role definition delete --name "Lab VM Operator"
az ad user delete --id labop@$DOMAIN
az ad group delete --group grp-lab-ops
# لو عملت الـ management group:
az account management-group subscription remove --name mg-lab --subscription $SUB
az account management-group delete --name mg-lab` },
  explain: ["الفرق بين Azure roles و Microsoft Entra roles", "الـ scope بيتورّث إزاي: management group ← subscription ← resource group ← resource", "ليه الـ lock بيمنع الـ Owner، وإيه الفرق بين CanNotDelete و ReadOnly", "الفرق بين policy effects: deny و audit و modify و deployIfNotExists", "ليه الـ budget مش بيوقف الصرف"],
  refs: [["Azure RBAC", "https://learn.microsoft.com/en-us/azure/role-based-access-control/overview"], ["Azure Policy effects", "https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-basics"]] },

/* ───────── 02 ───────── */
{ id: "lab02", grp: "AZ-104", track: "AZ-104", log: "AZ-104", lvl: "مبتدئ", time: "60–90 دقيقة", cost: "شبه مجاني", secs: ["2.1", "2.2", "2.3"],
  t: "Storage account متأمّن من أول يوم", en: "Storage access, SAS, data protection and lifecycle",
  scn: "فريق المحاسبة بيرفع فواتير PDF. شريك خارجي محتاج يقرا ملف واحد لمدة ساعة. الملفات القديمة لازم تنزل لـ tier أرخص، وأي ملف يتمسح بالغلط يرجع، والوصول من الشبكة يبقى من IP المكتب بس.",
  goal: "تفرّق بين طرق الوصول الأربعة (Entra ID، account key، service SAS، user delegation SAS) وتعرف كل واحدة بتتلغي إزاي.",
  arch: `Storage account (StorageV2, LRS, TLS 1.2, no public blob access)
 ├─ Firewall: default Deny + your IP
 ├─ Container: docs
 │    ├─ Entra ID  → Storage Blob Data Contributor (you)
 │    ├─ User delegation SAS  (1 hour, read)
 │    └─ Stored access policy → Service SAS
 ├─ Soft delete (blobs + containers) + Versioning
 └─ Lifecycle: Hot → Cool (30d) → Archive (90d) → Delete (365d)`,
  need: ["صلاحية Owner أو User Access Administrator على الـ RG (عشان تدّي نفسك data role)"],
  setup: `RG=rg-lab-02
LOC=westeurope
SA=stlab$RANDOM$RANDOM
az group create -n $RG -l $LOC
echo "hello from lab 02" > hello.txt
echo $SA`,
  steps: [
    { t: "اعمل storage account بإعدادات آمنة",
      d: "StorageV2 بـ LRS، أقل TLS هو 1.2، والـ public blob access مقفول.",
      v: "`az storage account show -n $SA --query \"{tls:minimumTlsVersion,public:allowBlobPublicAccess}\"`",
      h: "الفلاجات: `--min-tls-version` و `--allow-blob-public-access false`.",
      c: `az storage account create -n $SA -g $RG -l $LOC --sku Standard_LRS --kind StorageV2 \\
  --min-tls-version TLS1_2 --allow-blob-public-access false
SA_ID=$(az storage account show -n $SA -g $RG --query id -o tsv)` },
    { t: "ارفع ملف بهويتك مش بالـ key",
      d: "أنت Owner على الـ account، بس ده control plane. عشان تقرا وتكتب الداتا محتاج data role. ادّي نفسك Storage Blob Data Contributor وارفع `hello.txt` بـ `--auth-mode login`.",
      v: "قبل الـ role الرفع بيفشل بـ 403، وبعده بدقيقة أو اتنين بينجح.",
      h: "Owner و Contributor مفيهمش DataActions. استنى دقيقة بعد الـ assignment.",
      c: `ME=$(az ad signed-in-user show --query id -o tsv)
az role assignment create --assignee-object-id $ME --assignee-principal-type User \\
  --role "Storage Blob Data Contributor" --scope $SA_ID
az storage container create -n docs --account-name $SA --auth-mode login
az storage blob upload --account-name $SA -c docs -n hello.txt -f hello.txt --auth-mode login` },
    { t: "اعمل user delegation SAS لمدة ساعة",
      d: "الشريك محتاج يقرا `hello.txt` بس. اعمل SAS موقّع بهويتك (مش بالـ account key)، قراءة فقط، HTTPS فقط، وبينتهي بعد ساعة.",
      v: "`curl` على اللينك بيرجّع محتوى الملف. شيل حرف من الـ signature وهيرجّع 403.",
      h: "`--as-user` مع `--auth-mode login`. الـ user delegation SAS أقصى مدة له 7 أيام.",
      c: `EXP=$(date -u -d "+1 hour" '+%Y-%m-%dT%H:%MZ')
URL=$(az storage blob generate-sas --account-name $SA -c docs -n hello.txt \\
  --permissions r --expiry $EXP --https-only --auth-mode login --as-user --full-uri -o tsv)
curl "$URL"` },
    { t: "اعمل SAS مربوط بـ stored access policy",
      d: "اعمل policy اسمها `read-1d` على الـ container (قراءة و list ليوم)، وطلّع منها service SAS. بعدين امسح الـ policy وجرّب الـ SAS تاني.",
      v: "الـ SAS شغال، وبعد مسح الـ policy بيرجّع 403 من غير ما تغيّر الـ key.",
      h: "الـ stored access policy هي الطريقة الوحيدة لإلغاء service SAS من غير تدوير الـ key. الـ container بياخد 5 policies بحد أقصى.",
      c: `KEY=$(az storage account keys list -g $RG -n $SA --query "[0].value" -o tsv)
EXP=$(date -u -d "+1 day" '+%Y-%m-%dT%H:%MZ')
az storage container policy create -c docs -n read-1d --permissions rl --expiry $EXP \\
  --account-name $SA --account-key $KEY
SAS=$(az storage container generate-sas -n docs --policy-name read-1d \\
  --account-name $SA --account-key $KEY -o tsv)
curl "https://$SA.blob.core.windows.net/docs/hello.txt?$SAS"

az storage container policy delete -c docs -n read-1d --account-name $SA --account-key $KEY
sleep 40; curl "https://$SA.blob.core.windows.net/docs/hello.txt?$SAS"   # 403` },
    { t: "فعّل soft delete ورجّع ملف ممسوح",
      d: "فعّل soft delete للـ blobs والـ containers لمدة 7 أيام. امسح `hello.txt` ورجّعه.",
      v: "`az storage blob list --include d` بيطلّع الملف الممسوح، وبعد undelete بيرجع.",
      h: "`az storage account blob-service-properties update` فيه `--enable-delete-retention` و `--enable-container-delete-retention`.",
      c: `az storage account blob-service-properties update --account-name $SA -g $RG \\
  --enable-delete-retention true --delete-retention-days 7 \\
  --enable-container-delete-retention true --container-delete-retention-days 7

az storage blob delete --account-name $SA -c docs -n hello.txt --auth-mode login
az storage blob list --account-name $SA -c docs --include d --auth-mode login -o table
az storage blob undelete --account-name $SA -c docs -n hello.txt --auth-mode login` },
    { t: "فعّل versioning وشوف النسخ",
      d: "فعّل blob versioning، عدّل `hello.txt` وارفعه فوق القديم، واعرض النسخ.",
      v: "`--include v` بيطلّع نسختين بـ versionId مختلف.",
      h: "الـ versioning بيحميك من الكتابة فوق الملف، والـ soft delete بيحميك من المسح. بيشتغلوا مع بعض.",
      c: `az storage account blob-service-properties update --account-name $SA -g $RG --enable-versioning true
echo "second version" >> hello.txt
az storage blob upload --account-name $SA -c docs -n hello.txt -f hello.txt --overwrite --auth-mode login
az storage blob list --account-name $SA -c docs --include v --auth-mode login \\
  --query "[].{name:name,version:versionId,current:isCurrentVersion}" -o table` },
    { t: "اكتب lifecycle policy",
      d: "للـ blobs تحت `docs/`: Cool بعد 30 يوم من آخر تعديل، Archive بعد 90، ومسح بعد 365. والنسخ القديمة تتمسح بعد 90 يوم.",
      v: "`az storage account management-policy show --account-name $SA -g $RG`",
      h: "القاعدة بتتنفذ مرة في اليوم تقريباً، فمش هتشوف أثرها في نفس الجلسة.",
      c: `cat > lifecycle.json <<'EOF'
{ "rules": [ { "enabled": true, "name": "age-out", "type": "Lifecycle",
  "definition": {
    "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["docs/"] },
    "actions": {
      "baseBlob": {
        "tierToCool":    { "daysAfterModificationGreaterThan": 30 },
        "tierToArchive": { "daysAfterModificationGreaterThan": 90 },
        "delete":        { "daysAfterModificationGreaterThan": 365 } },
      "version": { "delete": { "daysAfterCreationGreaterThan": 90 } } } } } ] }
EOF
az storage account management-policy create --account-name $SA -g $RG --policy @lifecycle.json` },
    { t: "اقفل الشبكة على IP بتاعك",
      d: "خلّي الـ default action هو Deny، جرّب تعرض الـ blobs (هيفشل)، وبعدين ضيف الـ IP بتاعك.",
      v: "بعد Deny: `AuthorizationFailure`. بعد إضافة الـ IP بدقيقة: بيشتغل. من Cloud Shell الـ IP هو IP الـ Cloud Shell مش جهازك.",
      h: "`az storage account update --default-action Deny` وبعدين `az storage account network-rule add --ip-address`.",
      c: `az storage account update -n $SA -g $RG --default-action Deny --bypass AzureServices
sleep 30
az storage blob list --account-name $SA -c docs --auth-mode login -o table   # يفشل

MYIP=$(curl -s https://api.ipify.org)
az storage account network-rule add -g $RG --account-name $SA --ip-address $MYIP
sleep 60
az storage blob list --account-name $SA -c docs --auth-mode login -o table` },
    { t: "دوّر الـ account key",
      d: "طلّع service SAS عادي بالـ key الأول (من غير policy)، جرّبه، دوّر الـ key، وجرّبه تاني.",
      v: "الـ SAS بيموت فوراً بعد التدوير. أي user delegation SAS لسه صالح بيفضل شغال لأنه مش موقّع بالـ account key.",
      h: "`az storage account keys renew --key primary`. عشان كده فيه key تاني: تنقل التطبيقات عليه وأنت بتدوّر الأول.",
      c: `KEY=$(az storage account keys list -g $RG -n $SA --query "[0].value" -o tsv)
EXP=$(date -u -d "+1 hour" '+%Y-%m-%dT%H:%MZ')
SAS=$(az storage blob generate-sas --account-name $SA --account-key $KEY -c docs -n hello.txt \\
  --permissions r --expiry $EXP -o tsv)
curl "https://$SA.blob.core.windows.net/docs/hello.txt?$SAS"
az storage account keys renew -g $RG -n $SA --key primary
curl "https://$SA.blob.core.windows.net/docs/hello.txt?$SAS"   # 403` }
  ],
  brk: { t: "اقفل الـ shared key خالص",
    d: "عطّل الـ shared key access على الـ account. قبل ما تجرّب: توقّع أنهي من الطرق الأربعة هتقف وأنهي هتكمّل. وبعدين جرّب كل واحدة.",
    h: "أي حاجة موقّعة بالـ account key بتقف: الـ key نفسه، الـ service SAS، والـ account SAS.",
    c: `az storage account update -n $SA -g $RG --allow-shared-key-access false

# بيقف:   account key ، service SAS ، account SAS
# بيكمّل: Entra ID (--auth-mode login) ، user delegation SAS
az storage blob list --account-name $SA -c docs --auth-mode login -o table        # شغال
az storage blob list --account-name $SA -c docs --account-key $KEY -o table       # مرفوض` },
  clean: { d: "مسح الـ RG بيمسح الـ account وكل اللي فيه.",
    c: `az group delete -n rg-lab-02 --yes --no-wait` },
  explain: ["ليه Owner على الـ storage account مش كفاية عشان تقرا blob", "الفرق بين account SAS و service SAS و user delegation SAS، وكل واحد بيتلغي إزاي", "soft delete بيحمي من إيه و versioning بيحمي من إيه", "الفرق بين LRS و ZRS و GRS و GZRS", "ليه الـ Archive tier مش بيتقري مباشرة (rehydration)"],
  refs: [["Authorize access to data", "https://learn.microsoft.com/en-us/azure/storage/common/authorize-data-access"], ["Lifecycle management", "https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview"]] },

/* ───────── 03 ───────── */
{ id: "lab03", grp: "AZ-104", track: "AZ-104", log: "AZ-104", lvl: "متوسط", time: "2–3 ساعات", cost: "Bastion و 3 VMs بالساعة · امسح في نفس اليوم", secs: ["4.1", "4.2", "4.3"],
  t: "شبكة Hub-Spoke من غير أي public IP على الـ VMs", en: "Hub-spoke network, peering, UDR, NSG and Bastion",
  scn: "نفس فكرة مشروع الشبكات بتاع Packet Tracer بس على Azure: قسمين (app و data) كل واحد في VNet لوحده، وخدمات مشتركة في الـ hub. مفيش VM عليها public IP، والدخول من Bastion بس، والـ app بس هو اللي يوصل للـ data.",
  goal: "تشوف بعينك إن الـ peering مش transitive، وتحلها بـ NVA و route tables، وتتحكم في الترافيك بـ NSG.",
  arch: `                    Internet
                       │  (Bastion only)
        ┌──────────────┴──────────────┐
        │ vnet-hub  10.0.0.0/16       │
        │  AzureBastionSubnet 10.0.1.0/26
        │  snet-shared 10.0.0.0/24    │
        │    vm-nva 10.0.0.4 (IP forwarding)
        └───────┬─────────────┬───────┘
          peering             peering
        ┌───────┴──────┐  ┌───┴──────────┐
        │ vnet-app     │  │ vnet-data    │
        │ 10.1.0.0/16  │  │ 10.2.0.0/16  │
        │ vm-app .0.4  │  │ vm-data .0.4 │
        │ UDR → NVA    │  │ UDR → NVA    │
        └──────────────┘  │ NSG: 22 ← app│
                          └──────────────┘`,
  need: ["اشتراك يسمح بـ 3 VMs صغيرة (Standard_B1s أو أي حجم صغير متاح)"],
  setup: `RG=rg-lab-03
LOC=westeurope
PW="Lab-$RANDOM-$RANDOM-Az!"; echo "VM password: $PW"   # احفظه، هتدخل بيه من Bastion
az group create -n $RG -l $LOC`,
  steps: [
    { t: "اعمل الـ 3 VNets",
      d: "hub على `10.0.0.0/16`، app على `10.1.0.0/16`، data على `10.2.0.0/16`. الـ ranges لازم ماتتداخلش وإلا الـ peering هيترفض.",
      v: "`az network vnet list -g $RG --query \"[].{name:name,cidr:addressSpace.addressPrefixes[0]}\" -o table`",
      h: "`az network vnet create` بياخد `--subnet-name` و `--subnet-prefixes` في نفس الأمر.",
      c: `az network vnet create -g $RG -n vnet-hub  --address-prefixes 10.0.0.0/16 --subnet-name snet-shared --subnet-prefixes 10.0.0.0/24
az network vnet create -g $RG -n vnet-app  --address-prefixes 10.1.0.0/16 --subnet-name snet-app    --subnet-prefixes 10.1.0.0/24
az network vnet create -g $RG -n vnet-data --address-prefixes 10.2.0.0/16 --subnet-name snet-data   --subnet-prefixes 10.2.0.0/24` },
    { t: "اعمل الـ peering في الاتجاهين",
      d: "hub مع app و hub مع data. كل peering محتاج طرفين، والحالة لازم تبقى Connected في الاتنين.",
      v: "`az network vnet peering list -g $RG --vnet-name vnet-hub --query \"[].{n:name,state:peeringState}\" -o table` كله Connected.",
      h: "لو عملت طرف واحد الحالة هتفضل Initiated.",
      c: `for S in app data; do
  az network vnet peering create -g $RG -n hub-to-$S --vnet-name vnet-hub   --remote-vnet vnet-$S  --allow-vnet-access
  az network vnet peering create -g $RG -n $S-to-hub --vnet-name vnet-$S    --remote-vnet vnet-hub --allow-vnet-access
done` },
    { t: "اعمل VM في كل spoke من غير public IP",
      d: "`vm-app` على `10.1.0.4` و `vm-data` على `10.2.0.4`، من غير public IP ومن غير NSG على الـ NIC.",
      v: "`az vm list-ip-addresses -g $RG -o table` مفيهوش public IPs.",
      h: "`--public-ip-address \"\"` و `--nsg \"\"`. لو الحجم مش متاح جرّب `Standard_B2ats_v2`.",
      c: `for S in app data; do
  [ $S = app ] && IP=10.1.0.4 || IP=10.2.0.4
  az vm create -g $RG -n vm-$S --image Ubuntu2204 --size Standard_B1s \\
    --vnet-name vnet-$S --subnet snet-$S --private-ip-address $IP \\
    --public-ip-address "" --nsg "" \\
    --admin-username azureuser --authentication-type password --admin-password "$PW"
done` },
    { t: "انشر Bastion في الـ hub وادخل منه",
      d: "اعمل `AzureBastionSubnet` (/26 أو أكبر) و Bastion بـ SKU Basic، وادخل على `vm-app` من الـ portal. الـ Developer SKU مجاني لكنه مش بيوصل لـ VMs في VNets معمول لها peering، فهنا لازم Basic.",
      v: "فتحت session على `vm-app` من المتصفح وهي ملهاش public IP.",
      h: "اسم الـ subnet لازم يكون `AzureBastionSubnet` بالظبط. النشر بياخد حوالي 10 دقايق.",
      c: `az network vnet subnet create -g $RG --vnet-name vnet-hub -n AzureBastionSubnet --address-prefixes 10.0.1.0/26
az network public-ip create -g $RG -n pip-bastion --sku Standard -l $LOC
az network bastion create -g $RG -n bas-hub --vnet-name vnet-hub \\
  --public-ip-address pip-bastion --sku Basic -l $LOC

# Portal: vm-app > Connect > Bastion > username: azureuser + الباسورد` },
    { t: "اثبت إن الـ peering مش transitive",
      d: "من جوه `vm-app` جرّب توصل لـ `vm-data` على بورت 22. وبعدين اسأل Network Watcher عن الـ next hop.",
      v: "الاتصال CLOSED، والـ next hop نوعه `None`: مفيش route من app لـ data رغم إن الاتنين متصلين بالـ hub.",
      h: "الـ VMs هنا ملهاش outbound للإنترنت، فـ `az vm run-command` مش هيرجّع نتيجة. اختبر من جوه الـ VM عن طريق Bastion.",
      c: `# جوه vm-app (من Bastion):
timeout 3 bash -c '</dev/tcp/10.2.0.4/22' && echo OPEN || echo CLOSED

# من Cloud Shell:
az network watcher show-next-hop -g $RG --vm vm-app --source-ip 10.1.0.4 --dest-ip 10.2.0.4 -o table` },
    { t: "وصّل الـ spokes عن طريق NVA و route tables",
      d: "اعمل `vm-nva` في الـ hub على `10.0.0.4` وفعّل IP forwarding على الـ NIC وجوه الـ OS. اعمل route table لكل spoke يبعت ترافيك الـ spoke التاني للـ NVA، واسمح بالـ forwarded traffic على peering الـ spokes.",
      v: "نفس الاختبار من `vm-app` بقى OPEN، والـ next hop بقى `VirtualAppliance` على `10.0.0.4`.",
      h: "فيه 3 حاجات لازم كلها: IP forwarding على الـ NIC، `net.ipv4.ip_forward=1` جوه اللينكس، و `allowForwardedTraffic` على طرف الـ spoke في الـ peering.",
      c: `cat > nva-init.yaml <<'EOF'
#cloud-config
write_files:
  - path: /etc/sysctl.d/99-forward.conf
    content: |
      net.ipv4.ip_forward=1
runcmd:
  - sysctl --system
EOF
az vm create -g $RG -n vm-nva --image Ubuntu2204 --size Standard_B1s \\
  --vnet-name vnet-hub --subnet snet-shared --private-ip-address 10.0.0.4 \\
  --public-ip-address "" --nsg "" --custom-data nva-init.yaml \\
  --admin-username azureuser --authentication-type password --admin-password "$PW"
NIC=$(az vm show -g $RG -n vm-nva --query "networkProfile.networkInterfaces[0].id" -o tsv)
az network nic update --ids $NIC --ip-forwarding true

az network route-table create -g $RG -n rt-app
az network route-table route create -g $RG --route-table-name rt-app -n to-data \\
  --address-prefix 10.2.0.0/16 --next-hop-type VirtualAppliance --next-hop-ip-address 10.0.0.4
az network vnet subnet update -g $RG --vnet-name vnet-app -n snet-app --route-table rt-app

az network route-table create -g $RG -n rt-data
az network route-table route create -g $RG --route-table-name rt-data -n to-app \\
  --address-prefix 10.1.0.0/16 --next-hop-type VirtualAppliance --next-hop-ip-address 10.0.0.4
az network vnet subnet update -g $RG --vnet-name vnet-data -n snet-data --route-table rt-data

az network vnet peering update -g $RG --vnet-name vnet-app  -n app-to-hub  --set allowForwardedTraffic=true
az network vnet peering update -g $RG --vnet-name vnet-data -n data-to-hub --set allowForwardedTraffic=true` },
    { t: "احمي الـ data subnet بـ NSG",
      d: "NSG على `snet-data`: اسمح بـ 22 من `10.1.0.0/24` (الـ app) ومن subnet الـ Bastion، وامنع باقي الترافيك اللي جاي من الـ VirtualNetwork.",
      v: "من `vm-app` لسه OPEN. من `vm-nva` (ادخلها من Bastion) بقى CLOSED. و `test-ip-flow` بيقولك اسم الـ rule اللي قرر.",
      h: "الـ default rule رقم 65000 بيسمح بكل الـ VirtualNetwork، فلازم deny صريح بـ priority أقل من 65000 وأعلى رقمياً من قواعد السماح.",
      c: `az network nsg create -g $RG -n nsg-data
az network nsg rule create -g $RG --nsg-name nsg-data -n allow-ssh-app --priority 100 \\
  --access Allow --protocol Tcp --destination-port-ranges 22 --source-address-prefixes 10.1.0.0/24
az network nsg rule create -g $RG --nsg-name nsg-data -n allow-ssh-bastion --priority 200 \\
  --access Allow --protocol Tcp --destination-port-ranges 22 --source-address-prefixes 10.0.1.0/26
az network nsg rule create -g $RG --nsg-name nsg-data -n deny-vnet --priority 4000 \\
  --access Deny --protocol '*' --destination-port-ranges '*' --source-address-prefixes VirtualNetwork
az network vnet subnet update -g $RG --vnet-name vnet-data -n snet-data --network-security-group nsg-data

az network watcher test-ip-flow -g $RG --vm vm-data --direction Inbound --protocol TCP \\
  --local 10.2.0.4:22 --remote 10.0.0.4:40000 -o table` },
    { t: "ضيف private DNS zone",
      d: "اعمل zone اسمها `lab.internal` واربطها بالـ 3 VNets مع auto-registration، عشان الـ VMs توصل لبعض بالاسم.",
      v: "من `vm-app`: `getent hosts vm-data.lab.internal` بيرجّع `10.2.0.4`.",
      h: "الـ VNet الواحد يتربط بـ registration مع zone واحدة بس، لكن الـ zone تتربط بأكتر من VNet.",
      c: `az network private-dns zone create -g $RG -n lab.internal
for V in hub app data; do
  az network private-dns link vnet create -g $RG -z lab.internal -n link-$V -v vnet-$V -e true
done
az network private-dns record-set a list -g $RG -z lab.internal -o table` }
  ],
  brk: { t: "الـ route موجود والترافيك مش واصل",
    d: "اقفل `allowForwardedTraffic` على `data-to-hub`. الاتصال من app لـ data هيقف. شغّل `show-next-hop` تاني: هيقولك إيه؟ وليه مش كفاية لوحده للتشخيص؟",
    h: "الـ next hop بيوريك قرار الـ routing بس. فيه طبقتين كمان ممكن يمنعوا: الـ NSG وإعدادات الـ peering.",
    c: `az network vnet peering update -g $RG --vnet-name vnet-data -n data-to-hub --set allowForwardedTraffic=false

# next hop لسه VirtualAppliance: الـ routing سليم
az network watcher show-next-hop -g $RG --vm vm-app --source-ip 10.1.0.4 --dest-ip 10.2.0.4 -o table
# لكن الترافيك اللي راجع من الـ NVA للـ data مصدره مش من الـ hub، فالـ peering بيرميه

# الإصلاح
az network vnet peering update -g $RG --vnet-name vnet-data -n data-to-hub --set allowForwardedTraffic=true` },
  clean: { d: "Bastion بيتحاسب بالساعة حتى لو مش بتستخدمه. امسح الـ RG في نفس اليوم.",
    c: `az group delete -n rg-lab-03 --yes --no-wait` },
  explain: ["ليه الـ peering مش transitive وإيه الحلول (NVA، Azure Firewall، VPN gateway، peering مباشر)", "ترتيب تقييم الـ NSG rules والـ default rules الثلاثة", "الفرق بين NSG على الـ subnet و NSG على الـ NIC وترتيبهم في الـ inbound والـ outbound", "الفرق بين IP flow verify و Next hop و Connection troubleshoot", "ليه VM جديدة من غير public IP مبقتش بتوصل للإنترنت، وإيه طرق الـ outbound الصريحة"],
  refs: [["Hub-spoke topology", "https://learn.microsoft.com/en-us/azure/architecture/networking/architecture/hub-spoke"], ["Bastion SKUs", "https://learn.microsoft.com/en-us/azure/bastion/bastion-sku-comparison"], ["Default outbound access", "https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access"]] },

/* ───────── 04 ───────── */
{ id: "lab04", grp: "AZ-104", track: "AZ-104", log: "AZ-104", lvl: "متوسط", time: "90 دقيقة", cost: "2–4 VMs صغيرة بالساعة", secs: ["3.2", "4.3"],
  t: "موقع بيتحمّل: Load Balancer و Scale Set", en: "Load balancer, health probes and VM Scale Set autoscale",
  scn: "موقع داخلي بيقع كل ما السيرفر الوحيد يتعمله restart. المطلوب: نسختين على الأقل ورا load balancer، اللي تقع تخرج من الخدمة لوحدها، والعدد يزيد مع الضغط ويقل بعده.",
  goal: "تبني Standard Load Balancer بإيدك قطعة قطعة (frontend، backend pool، probe، rule، outbound rule) وتفهم كل قطعة بتعمل إيه.",
  arch: `Internet
   │ :80
Public IP ── lb-web (Standard)
              ├─ health probe  HTTP :80 /
              ├─ LB rule       80 → 80
              └─ outbound rule (SNAT)
                    │
           bepool ──┴── vmss-web  (2 → 4 instances)
                         snet-web 10.10.0.0/24 + nsg-web (allow 80)
                         autoscale: CPU > 70% out · CPU < 30% in`,
  need: ["اشتراك يسمح بـ 4 vCPUs على الأقل في الـ region"],
  setup: `RG=rg-lab-04
LOC=westeurope
az group create -n $RG -l $LOC
az network vnet create -g $RG -n vnet-web --address-prefixes 10.10.0.0/16 --subnet-name snet-web --subnet-prefixes 10.10.0.0/24

# سيرفر ويب بسيط بـ python عشان مانحتاجش ننزّل حاجة من الإنترنت
cat > web-init.yaml <<'EOF'
#cloud-config
write_files:
  - path: /etc/systemd/system/web.service
    content: |
      [Unit]
      Description=lab web
      After=network.target
      [Service]
      WorkingDirectory=/srv/web
      ExecStart=/usr/bin/python3 -m http.server 80
      Restart=always
      [Install]
      WantedBy=multi-user.target
runcmd:
  - mkdir -p /srv/web
  - hostname > /srv/web/index.html
  - systemctl daemon-reload
  - systemctl enable --now web
EOF`,
  steps: [
    { t: "اعمل الـ scale set والـ load balancer",
      d: "Scale set بـ 2 instances ورا Standard LB جديد اسمه `lb-web`، وكل instance بتشغّل صفحة فيها اسمها.",
      v: "`az vmss list-instances -g $RG -n vmss-web -o table` بيطلّع 2 بحالة Succeeded.",
      h: "`az vmss create` بيعمل الـ LB والـ public IP والـ backend pool لو ادّيته `--lb` و `--backend-pool-name`.",
      c: `az vmss create -g $RG -n vmss-web --image Ubuntu2204 --vm-sku Standard_B1s --instance-count 2 \\
  --orchestration-mode Uniform --upgrade-policy-mode Automatic \\
  --vnet-name vnet-web --subnet snet-web \\
  --lb lb-web --lb-sku Standard --backend-pool-name bepool \\
  --custom-data web-init.yaml --admin-username azureuser --generate-ssh-keys

az network lb show -g $RG -n lb-web --query "{fe:frontendIPConfigurations[].name,pools:backendAddressPools[].name,rules:loadBalancingRules[].name,probes:probes[].name}"` },
    { t: "ضيف health probe و load balancing rule",
      d: "probe من نوع HTTP على بورت 80 والمسار `/`، و rule توزّع بورت 80 على الـ pool. اقفل الـ implicit SNAT في الـ rule لأنك هتعمل outbound rule صريحة بعدين.",
      v: "`az network lb rule list -g $RG --lb-name lb-web -o table` فيه rule على 80.",
      h: "الـ rule محتاجة اسم الـ frontend IP config. هاته من `az network lb frontend-ip list`.",
      c: `FE=$(az network lb frontend-ip list -g $RG --lb-name lb-web --query "[0].name" -o tsv)
az network lb probe create -g $RG --lb-name lb-web -n hp-http --protocol Http --port 80 --path /
az network lb rule create -g $RG --lb-name lb-web -n http --protocol Tcp \\
  --frontend-port 80 --backend-port 80 --frontend-ip-name $FE \\
  --backend-pool-name bepool --probe-name hp-http --disable-outbound-snat true` },
    { t: "افتح بورت 80 بـ NSG",
      d: "جرّب تفتح الـ IP دلوقتي: مش هيرد. الـ Standard LB مقفول افتراضياً لحد ما NSG يسمح. اعمل NSG يسمح بـ 80 من الإنترنت واربطه بالـ subnet.",
      v: "`curl` على الـ public IP بيرجّع اسم instance، ومع التكرار الاسم بيتغيّر.",
      h: "الـ probe جاي من `AzureLoadBalancer` وده مسموح بالـ default rules، فمش محتاج rule له.",
      c: `az network nsg create -g $RG -n nsg-web
az network nsg rule create -g $RG --nsg-name nsg-web -n allow-http --priority 100 \\
  --access Allow --protocol Tcp --destination-port-ranges 80 --source-address-prefixes Internet
az network vnet subnet update -g $RG --vnet-name vnet-web -n snet-web --network-security-group nsg-web

IP=$(az network public-ip list -g $RG --query "[0].ipAddress" -o tsv)
for i in 1 2 3 4 5 6; do curl -s --max-time 5 http://$IP; done` },
    { t: "ادّي الـ instances مخرج للإنترنت",
      d: "الـ instances ورا Standard LB من غير outbound rule ملهاش إنترنت. ضيف outbound rule على نفس الـ frontend واتأكد من جوه instance.",
      v: "`run-command` بيرجّع نفس الـ public IP بتاع الـ LB: الخروج بيحصل بـ SNAT عليه.",
      h: "`az network lb outbound-rule create` محتاج `--frontend-ip-configs` و `--address-pool` و `--outbound-ports`.",
      c: `az network lb outbound-rule create -g $RG --lb-name lb-web -n out-all --protocol All \\
  --frontend-ip-configs $FE --address-pool bepool --outbound-ports 10000 --idle-timeout 15

ID=$(az vmss list-instances -g $RG -n vmss-web --query "[0].instanceId" -o tsv)
az vmss run-command invoke -g $RG -n vmss-web --instance-id $ID --command-id RunShellScript \\
  --scripts "curl -s --max-time 10 https://api.ipify.org" --query "value[0].message" -o tsv` },
    { t: "وقّع instance وشوف الـ probe",
      d: "وقّف خدمة الويب على instance واحدة وكرر الـ curl.",
      v: "كل الردود بتيجي من الـ instance السليمة. شغّل الخدمة تاني وهترجع تدخل في التوزيع بعد probe أو اتنين.",
      h: "الـ VM نفسها لسه Running. الـ probe هو اللي بيحدد مين ياخد ترافيك، مش حالة الـ VM.",
      c: `az vmss run-command invoke -g $RG -n vmss-web --instance-id $ID --command-id RunShellScript --scripts "systemctl stop web"
sleep 20; for i in 1 2 3 4 5 6; do curl -s --max-time 5 http://$IP; done
az vmss run-command invoke -g $RG -n vmss-web --instance-id $ID --command-id RunShellScript --scripts "systemctl start web"` },
    { t: "اعمل autoscale على الـ CPU",
      d: "حد أدنى 2 وأقصى 4. زوّد instance لما متوسط الـ CPU يعدّي 70% لمدة 5 دقايق، وقلّل واحدة لما ينزل تحت 30%.",
      v: "`az monitor autoscale show -g $RG -n as-web` فيه القاعدتين.",
      h: "لازم قاعدة scale in مع الـ scale out، وإلا العدد هيزيد ومش هيرجع.",
      c: `az monitor autoscale create -g $RG -n as-web --resource vmss-web \\
  --resource-type Microsoft.Compute/virtualMachineScaleSets --min-count 2 --max-count 4 --count 2
az monitor autoscale rule create -g $RG --autoscale-name as-web --condition "Percentage CPU > 70 avg 5m" --scale out 1
az monitor autoscale rule create -g $RG --autoscale-name as-web --condition "Percentage CPU < 30 avg 5m" --scale in 1` },
    { t: "اضغط على الـ CPU وشوف الـ scale out",
      d: "شغّل حمل على كل الـ instances لمدة ربع ساعة وراقب العدد.",
      v: "بعد 5 لـ 10 دقايق العدد بيبقى 3، وبعد ما الحمل يخلص بيرجع 2. شوف السبب في Run history بتاع الـ autoscale.",
      h: "`yes > /dev/null` بياكل core كاملة. شغّله في الخلفية بـ `nohup` عشان الـ run-command يرجع.",
      c: `for ID in $(az vmss list-instances -g $RG -n vmss-web --query "[].instanceId" -o tsv); do
  az vmss run-command invoke -g $RG -n vmss-web --instance-id $ID --command-id RunShellScript \\
    --scripts "nohup timeout 900 yes > /dev/null 2>&1 &"
done
watch -n 30 "az vmss list-instances -g $RG -n vmss-web -o table"` }
  ],
  brk: { t: "الـ probe سليم والموقع واقع",
    d: "امسح rule الـ `allow-http` من الـ NSG. الموقع هيقف من بره. افتح Load balancer ← Insights أو Metrics ← Health Probe Status: هتلاقيه 100%. اشرح ليه الـ probe شايف الـ instances سليمة والمستخدم مش واصل.",
    h: "مصدر الـ probe هو service tag اسمه AzureLoadBalancer ومسموح بـ default rule رقم 65001. مصدر المستخدم هو Internet.",
    c: `az network nsg rule delete -g $RG --nsg-name nsg-web -n allow-http
curl -s --max-time 5 http://$IP || echo "timeout"

az network nsg show -g $RG -n nsg-web --query "defaultSecurityRules[].{p:priority,name:name,src:sourceAddressPrefix,access:access}" -o table
# 65001 AllowAzureLoadBalancerInBound  → الـ probe بيعدّي
# 65500 DenyAllInBound                 → المستخدم بيترمي
# الدرس: health probe سليم مش معناه إن العميل واصل.

# الإصلاح
az network nsg rule create -g $RG --nsg-name nsg-web -n allow-http --priority 100 \\
  --access Allow --protocol Tcp --destination-port-ranges 80 --source-address-prefixes Internet` },
  clean: { d: "الـ scale set بيتحاسب على كل instance شغالة.",
    c: `az group delete -n rg-lab-04 --yes --no-wait` },
  explain: ["الفرق بين Basic و Standard Load Balancer", "الفرق بين Load Balancer (طبقة 4) و Application Gateway (طبقة 7)", "الـ health probe بيقرر إيه بالظبط، ومصدره إيه", "ليه محتاج outbound rule، وإيه بدايلها (NAT gateway، public IP على الـ VM)", "الفرق بين availability set و availability zones و scale set"],
  refs: [["Load Balancer components", "https://learn.microsoft.com/en-us/azure/load-balancer/components"], ["Outbound rules", "https://learn.microsoft.com/en-us/azure/load-balancer/outbound-rules"]] },

/* ───────── 05 ───────── */
{ id: "lab05", grp: "AZ-104", track: "AZ-104", log: "AZ-104", lvl: "متوسط", time: "90 دقيقة", cost: "VM صغيرة + logs قليلة", secs: ["5.1"],
  t: "اعرف قبل ما المستخدم يشتكي: Monitor و Alerts", en: "Azure Monitor, Log Analytics, alerts and KQL",
  scn: "سيرفر وقع بالليل ومحدش عرف غير الصبح. المطلوب: الـ logs والـ metrics في مكان واحد، إيميل لو الـ CPU علي أو لو حد طفّى الـ VM، وإيميل لو السيرفر سكت خالص، ومن غير إزعاج في وقت الصيانة.",
  goal: "تفرّق بين الـ metrics والـ logs والـ activity log، وتعمل الأنواع الثلاثة من الـ alerts، وتكتب أول KQL queries.",
  arch: `vm-mon ── Azure Monitor Agent ── Data collection rule ──┐
Subscription activity log ── diagnostic setting ─────────┤
                                                         ▼
                                          Log Analytics workspace (law-lab)
                                                         │ KQL
   Metric alert (CPU)  ─┐                                │
   Activity log alert  ─┼──► Action group (email) ◄── Log alert (Heartbeat)
   Alert processing rule: mute during maintenance`,
  need: ["إيميل توصلك عليه التنبيهات"],
  setup: `RG=rg-lab-05
LOC=westeurope
EMAIL=you@example.com        # غيّره
az group create -n $RG -l $LOC
# public IP من غير أي بورت مفتوح: للخروج بس، عشان الـ agent يبعت الـ logs
az vm create -g $RG -n vm-mon --image Ubuntu2204 --size Standard_B1s \\
  --public-ip-sku Standard --nsg-rule NONE --admin-username azureuser --generate-ssh-keys
VM_ID=$(az vm show -g $RG -n vm-mon --query id -o tsv)
RG_ID=$(az group show -n $RG --query id -o tsv)`,
  steps: [
    { t: "اعمل Log Analytics workspace",
      d: "ده المخزن اللي كل الـ logs هتروحله وهتكتب عليه KQL.",
      v: "`az monitor log-analytics workspace show -g $RG -n law-lab --query retentionInDays`",
      h: "الاحتفاظ الافتراضي 30 يوم.",
      c: `az monitor log-analytics workspace create -g $RG -n law-lab -l $LOC
LAW_ID=$(az monitor log-analytics workspace show -g $RG -n law-lab --query id -o tsv)` },
    { t: "اجمع logs و performance من الـ VM",
      d: "اعمل data collection rule تجمع Syslog و performance counters من `vm-mon` وتبعتهم للـ workspace. الـ portal بينزّل Azure Monitor Agent وبيفعّل managed identity لوحده.",
      v: "بعد 5 لـ 10 دقايق: `Heartbeat | take 5` بيرجّع صفوف في Logs.",
      h: "الـ DCR هي اللي بتحدد إيه اللي يتجمع ويروح فين. من غيرها الـ agent مش بيبعت حاجة.",
      c: `Portal:
Monitor > Data Collection Rules > Create
  Rule name: dcr-lab     Platform: Linux     Region: نفس region الـ VM
  Resources:   + Add resources > vm-mon
  Collect and deliver > + Add data source
     1) Performance Counters (Basic)   → Destination: Azure Monitor Logs > law-lab
     2) Linux Syslog (auth, authpriv, daemon, syslog عند LOG_INFO) → law-lab` },
    { t: "ابعت الـ activity log للـ workspace",
      d: "الـ activity log (مين عمل إيه على الموارد) بيتحفظ 90 يوم ومش بيتعمل عليه KQL غير لو بعته للـ workspace بـ diagnostic setting على مستوى الاشتراك.",
      v: "بعد ما تعمل أي تعديل وتستنى دقايق: `AzureActivity | take 5` بيرجّع صفوف.",
      h: "`az monitor diagnostic-settings subscription create`.",
      c: `az monitor diagnostic-settings subscription create -n activity-to-law --location $LOC --workspace $LAW_ID \\
  --logs '[{"category":"Administrative","enabled":true},{"category":"Security","enabled":true},{"category":"Policy","enabled":true}]'` },
    { t: "اعمل action group",
      d: "الـ action group هو «مين يتبلّغ وإزاي». اعمل واحد بيبعت إيميل ليك.",
      v: "بيوصلك إيميل إنك اتضفت لـ action group.",
      h: "الـ action group بيتعمل مرة ويتستخدم في كل الـ alerts.",
      c: `az monitor action-group create -g $RG -n ag-lab --short-name aglab --action email me $EMAIL
AG_ID=$(az monitor action-group show -g $RG -n ag-lab --query id -o tsv)` },
    { t: "Metric alert على الـ CPU",
      d: "تنبيه لو متوسط الـ CPU عدّى 80% في آخر 5 دقايق، بيتقيّم كل دقيقة. بعدين ولّع الـ CPU واستنى الإيميل.",
      v: "إيميل Fired، وبعد ما الحمل يخلص إيميل Resolved. الـ metric alerts هي stateful.",
      h: "`--condition \"avg Percentage CPU > 80\"` مع `--window-size 5m` و `--evaluation-frequency 1m`.",
      c: `az monitor metrics alert create -g $RG -n cpu-high --scopes $VM_ID \\
  --condition "avg Percentage CPU > 80" --window-size 5m --evaluation-frequency 1m \\
  --severity 2 --action $AG_ID

az vm run-command invoke -g $RG -n vm-mon --command-id RunShellScript \\
  --scripts "nohup timeout 600 yes > /dev/null 2>&1 &"` },
    { t: "Activity log alert على إطفاء الـ VM",
      d: "تنبيه لو أي حد عمل deallocate لأي VM في الـ RG. جرّبه بإنك تطفّي الـ VM وتشغّلها.",
      v: "إيميل فيه اسم اللي عمل العملية (Caller).",
      h: "الشرط بيتكتب `category=Administrative and operationName=...`.",
      c: `az monitor activity-log alert create -g $RG -n vm-deallocated --scope $RG_ID \\
  --condition category=Administrative and operationName=Microsoft.Compute/virtualMachines/deallocate/action \\
  --action-group $AG_ID

az vm deallocate -g $RG -n vm-mon && az vm start -g $RG -n vm-mon` },
    { t: "اكتب KQL",
      d: "في Logs على الـ workspace: (1) آخر heartbeat لكل جهاز. (2) متوسط الـ CPU كل 5 دقايق. (3) آخر العمليات على الـ VMs ومين عملها. (4) محاولات الدخول الفاشلة من الـ Syslog.",
      v: "كل query بيرجّع نتيجة، والتاني بيترسم timechart.",
      h: "لو جدول الـ Perf فاضي أو الأسماء مختلفة: `Perf | distinct ObjectName, CounterName`.",
      c: `Heartbeat
| summarize last = max(TimeGenerated) by Computer

Perf
| where CounterName == "% Processor Time"
| summarize cpu = avg(CounterValue) by bin(TimeGenerated, 5m), Computer
| render timechart

AzureActivity
| where OperationNameValue has "virtualMachines"
| project TimeGenerated, Caller, OperationNameValue, ActivityStatusValue
| order by TimeGenerated desc

Syslog
| where Facility in ("auth", "authpriv") and SyslogMessage has_any ("Failed", "Invalid user")
| project TimeGenerated, Computer, SyslogMessage` },
    { t: "اكتم التنبيهات في وقت الصيانة",
      d: "اعمل alert processing rule تشيل الـ action groups من أي alert في الـ RG كل يوم جمعة من 2 لـ 4 الفجر.",
      v: "الـ rule ظاهرة في Alerts ← Alert processing rules وحالتها Enabled.",
      h: "الـ alert بيتسجّل عادي، اللي بيتكتم هو الإشعار بس.",
      c: `Portal:
Monitor > Alerts > Alert processing rules > Create
  Scope:          rg-lab-05
  Rule settings:  Suppress notifications
  Scheduling:     Recurring > Weekly > Friday 02:00–04:00 > Time zone: Tripoli` }
  ],
  brk: { t: "السيرفر سكت والـ CPU alert ساكت",
    d: "وقّف الـ agent على الـ VM. مفيش أي alert هيضرب، لأن الـ metric alert شايف CPU طبيعي. اعمل log alert يكتشف إن جهاز بطّل يبعت heartbeat من أكتر من 10 دقايق.",
    h: "دوّر على الأجهزة اللي آخر heartbeat ليها أقدم من `ago(10m)`. خلّي فترة البحث أطول من فترة السكوت وإلا الجهاز هيختفي من النتيجة.",
    c: `az vm run-command invoke -g $RG -n vm-mon --command-id RunShellScript --scripts "systemctl stop azuremonitoragent"

Portal: law-lab > Logs > اكتب الـ query > New alert rule
  Heartbeat
  | summarize last = max(TimeGenerated) by Computer
  | where last < ago(10m)
  Measurement: Table rows, Count     Threshold: > 0
  Evaluation:  every 5 minutes, lookback 1 hour     Action group: ag-lab

# بعد ما الـ alert يضرب:
az vm run-command invoke -g $RG -n vm-mon --command-id RunShellScript --scripts "systemctl start azuremonitoragent"` },
  clean: { d: "الـ diagnostic setting على الاشتراك مش جوه الـ RG، فلازم يتمسح لوحده.",
    c: `az monitor diagnostic-settings subscription delete -n activity-to-law --yes
az group delete -n rg-lab-05 --yes --no-wait` },
  explain: ["الفرق بين metrics و logs و activity log، وكل واحد بيتحفظ قد إيه", "الأنواع الثلاثة للـ alerts وإمتى تستخدم كل واحد", "دور الـ data collection rule والـ Azure Monitor Agent", "الفرق بين action group و alert processing rule", "ليه الـ metric alert مش بيكتشف إن الـ agent واقف"],
  refs: [["Azure Monitor overview", "https://learn.microsoft.com/en-us/azure/azure-monitor/overview"], ["KQL quick reference", "https://learn.microsoft.com/en-us/kusto/query/kql-quick-reference"]] }
];
