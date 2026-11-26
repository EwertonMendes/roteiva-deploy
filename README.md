# Roteiva Deploy

Controlador público de releases do Roteiva. A política e os workflows são públicos. Código, dados e artefatos de compilação ficam no repositório de origem.

- **DEV and PROD - Verify release artifact** confere o commit atual da master, o PR mesclado, a revisão conhecida do workflow e todos os gates exigidos daquele SHA.
- **DEV and PROD - Deployment approval test** executa somente um teste de aprovação. Selecione o destino no disparo manual. O modo production passa pelos dois gates do GitHub, em sequência.
- **Deploy and verify DEV and PROD (Cloudflare and Firebase)** publica a API/Worker, D1, Hosting e Firestore conforme o ambiente e a operação selecionada. O título de cada execução distingue deploy completo, parcial, verificação de permissões e busca automática de release DEV. A publicação PROD continua protegida por aprovação. O modo `verify` apenas verifica permissões do Firebase.

O token de leitura deve ficar no ambiente `source-read`. Use um token fine-grained limitado a `roteiva-web`, com Actions, Contents e Pull requests em leitura. Confira expiração e escopo após cada renovação. A leitura anônima existe para o ensaio público e exige que o repositório ainda seja público.

O workflow de release do repositório de origem é fixado pelo ID e pela lista de SHAs de arquivo revisados. Quando ele mudar legitimamente, revise a mudança neste controlador antes de aceitar commits novos. Uma execução ignorada, cancelada ou de PR não é evidência do SHA final da master.

As variáveis `GCP_WORKLOAD_IDENTITY_PROVIDER` e `GCP_DEPLOY_SERVICE_ACCOUNT` ficam nos respectivos ambientes Firebase. O Google aceita apenas tokens do proprietário e repositório esperados, emitidos pela revisão em `master` de `firebase-release.yml` e com o ambiente Firebase correspondente. As contas DEV e PROD só têm papéis de deploy no próprio projeto.

Alterações vão por PR. Execute node --test antes de atualizar a política. O controlador nunca precisa receber chaves de runtime do Worker nem material dos usuários no código, logs ou artefatos públicos.
