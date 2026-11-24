# Roteiva — migração para repositório privado

## Estado verificado em 24/11/2026 UTC

**Não declarar a migração concluída antes da virada e dos testes do runner real no repositório privado.** A origem ainda está pública. Os serviços DEV e PROD continuam operacionais.

### Evidências

| Verificação | Execução |
|---|---|
| Conector ChatGPT em repositório privado (leitura, branch, commit, PR e Actions) | roteiva-private-connector-check PR #2 / run 45285192771 |
| DEV pelo controlador (Worker/D1, Firebase/Firestore, OIDC) | https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45290845053 |
| PROD pelo controlador, incluindo as duas aprovações | https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45298002721 |
| Descoberta automática de pacote concluído DEV, ensaio manual real | https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45299894444 |
| Preview real de PR, sem publicação do Worker | https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45301108333 |
| Checks do controlador (modos especiais e QA) | https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45300590115 |
| Checks de origem do PR #228 | https://github.com/EwertonMendes/roteiva-web/actions/runs/45300560552 |
| Controle de duplicidade DEV | https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45301356398 |

PRs de origem #227 e #228 e de controlador #7, #8 e #9 integrados. A origem em master no momento deste registro: `88d5db44b26c253a42e4d09e9614fcbf9f2bc022`.

### Arquitetura

- `roteiva-web`: código, CI, pacotes, artefatos e logs de compilação. O runner local será registrado somente depois da origem privada, sem credenciais de publicação de repositório.
- `roteiva-deploy`: política de release, aprovação e publicação temporária em GitHub-hosted runners. Nenhum pacote de origem é armazenado como artefato do controlador público. Metadados de release (SHA e IDs) são públicos.
- Após um push na master privada com gates verdes, o workflow source-only gera o pacote DEV. O controlador verifica periodicamente o pacote **concluído**. Não há PAT de escrita entre os repositórios. O receipt impede repetir o mesmo SHA ou desfazer uma promoção manual de PR. O proprietário pode reexecutar manualmente um release após falha.
- PROD continua exigindo o SHA atual, gates, pacote verificável e as aprovações cloudflare-production e firebase-production.
- Os jobs legados da origem que dependem dos environments de publicação são guardados contra execução privada. Não remover suas validações de PR.

## Operação dos fluxos

### DEV automático

Após a virada, basta mergear o PR autorizado. O runner precisa estar online. Para promoção imediata após a criação do pacote, disparar `firebase-release.yml` no controlador com `operation=auto-dev`, `target=development` (apenas para master). O cron pode sofrer atrasos do GitHub.

### Release manual / PR

1. Na origem: `release-package.yml`, ref `master`, sha completo e target `dev` ou `prod`.
2. Para PR aberto: ref = branch exata do PR, `target=dev`, `sha=PR head SHA`, `pr_number` = número. A revisão do workflow e os três gates do PR devem ser aprovados; atualizar o branch com master se necessário.
3. No controlador: `firebase-release.yml`, operation `release`, target `development` ou `production`, sha e package_run_id. PRs só DEV, com `confirmation=PUBLICAR_PR_DEV` e pr_number. Em PROD: `confirmation=DEPLOY ROTEIVA PROD` e aprovar os environments. As opções `frontend_only`, `worker_only` (DEV) e `firestore_only` (DEV) são mutuamente exclusivas.
4. Preview: `operation=preview`, target development, PR e confirmação acima. Publica canal temporário pr-N, não modifica Worker ou Hosting ao vivo.
5. Site institucional: pacote prod de master, operation `site`, target production, `confirmation=DEPLOY ROTEIVA SITE`. Publica apenas o site institucional. O modo requer homologação real quando utilizado, com aprovação PROD.
6. Redação dos logs: operation `observability`, target production, `confirmation=APLICAR REDACAO PROD`. Usa pacote prod e ambiente protegido; não republica Worker.
7. QA infraestrutura DEV: operation `qa-infra`, target development, pacote dev de master. Executa verificações read-only de D1/Worker. QA público de navegador permanece na origem. QA autenticado com sessão de conta de teste **não deve mover dados/artefatos para o controlador público**; precisa de reaprovisionamento em execução privada isolada se utilizado. Os últimos três ensaios QA real DEV foram smoke, com job autenticado ignorado.

## Bloqueios administrativos reais

Os conectores não podem alterar visibilidade do repositório, registrar runner no Windows, configurar IAM Google ou recuperar valores de secrets. Não contornar isso exportando secrets por logs, commits ou artefatos.

### Identidades dedicadas de dados

- `firebase-ops.yml` na origem: privado somente, GitHub-hosted, owner/manual/master; OIDC separado de deploy, projeto DEV, `FIREBASE_DATA_WIF_PROVIDER`, `FIREBASE_DATA_SERVICE_ACCOUNT`, `FIREBASE_DATA_OPS_ENABLED=true`. Conta `roteiva-private-dev-ops@roteiva-web-dev.iam.gserviceaccount.com`, papel Datastore User. Provedor restrito a ID da origem, ID do proprietário/ator, workflow ref, evento manual, runner github-hosted e visibilidade private. Não usar a identidade de Hosting.
- `prod-qa-access.yml` no controlador: source package verificado, ambiente cloudflare-production protegido, apenas conta de QA já autorizada por hash. `GCP_QA_WIF_PROVIDER`, `GCP_QA_SERVICE_ACCOUNT` (conta `roteiva-private-prod-qa@roteiva-web-prod.iam.gserviceaccount.com`), `QA_PROD_TARGET_EMAIL` (secret, nunca input público). OIDC dedicado e restrito ao ID do controlador, workflow ref exato, owner/manual/master, runner GitHub-hosted e environment cloudflare-production. Usar primeiro `action=check`, nunca expirar/restaurar só para ensaio.
- As duas identidades usam tokens curtos e não substituem as chaves de runtime do Roteiva. A autorização IAM e o secret precisam ser criados pelo proprietário em seu PC; a configuração ainda não foi executada/validada de ponta a ponta.

### Virada final (somente após validação)

1. Conferir os checks finais, a publicação DEV pelo controlador e o PROD aprovado. Validar operação QA protegida read-only e preparar DEV data OIDC.
2. Verificar backup local e destino do GitHub Pages histórico (o site/app atual usa Firebase e Cloudflare). Preservar os valores de runtime e configurações de billing/OAuth.
3. Confirmar que a origem não tem secrets de repositório de publicação; remover apenas o `FIREBASE_SERVICE_ACCOUNT` legado de escopo de repositório após confirmação de backup e transferência. Não apagar indiscriminadamente secrets ou environments.
4. Alterar visibilidade somente de `roteiva-web` para PRIVATE. Manter `roteiva-deploy` PUBLIC. Não reverter automaticamente para público em caso de problema.
5. Confirmar `ROTEIVA_CI_RUNNER=self-hosted`. No Windows, na conta do usuário normal, executar o runner preparado pelo Codex:
   ```cmd
   node "C:\Users\ewert\OneDrive\Documentos\ChatGPT\Roteiva\private-github-migration\scripts\runner\run-windows-vm.cjs" product --watch
   ```
   Conferir runner online com labels linux/x64/roteiva-ci e inicialização ao logon. Validar os jobs da origem com o runner real; se offline, não considerar checks aprovados.
6. Confirmar o acesso do ChatGPT ao repositório agora privado com leitura, PR e Actions. Verificar o controlador com source-read, efetuar um novo pacote DEV e exercício completo de deploy. Testar Firestore data ops em DEV com operação sem dados de clientes.
7. Não remover tokens, chaves ou backups de contingência até a verificação do fluxo novo. Renovar SOURCE_READ_TOKEN antes de expirar (o prazo depende do token criado pelo proprietário).
