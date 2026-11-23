# Roteiva — estado da migração GitHub privado (23/11/2026)

> **NÃO alterar a visibilidade do repositório principal ainda.** A publicação real pelo controlador ainda não passou em DEV.

## Evidência já confirmada

- `roteiva-web` segue público e a CI da master concluiu para `60e294ce5be7b71152dc0f17535921a166cb7a10`.
- O ensaio completo do empacotamento DEV ficou no run `45287937010` do repositório de origem, artefato `roteiva-release-dev-60e294ce5be7b71152dc0f17535921a166cb7a10` com digest SHA-256, armazenado **somente no repositório de origem**.
- O controlador aprovou o SHA, o PR de origem, o workflow conhecido e seus jobs de CI.
- O workflow `Verify release source` conseguiu baixar, extrair e conferir os arquivos do artefato em modo somente leitura: https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45288572327
- O workflow existente `firebase-release.yml` manteve sua identidade OIDC e validou permissões DEV: https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45288191906
- O GitHub integrado ao ChatGPT comprovou leitura, branch, commit, PR e disparo de Action no repositório privado descartável `roteiva-private-connector-check`: PR #2.
- O piloto Linux do runner isolado passou em execuções anteriores.
- O teste de publicação DEV pela nova esteira iniciou e fez preflight com sucesso, mas parou **antes de qualquer alteração no Cloudflare** por falta de `SOURCE_READ_TOKEN` no environment `cloudflare-development`: https://github.com/EwertonMendes/roteiva-deploy/actions/runs/45288305089

## Pendências de configuração do GitHub (executar no PC com Codex/gh; nunca enviar segredos no chat)

1. Reaproveitar o token de leitura fine-grained do repositório `roteiva-web`, já validado em `source-read`. Se o valor original não estiver disponível com segurança, **gerar um novo** e revogar o anterior somente depois da validação. Não é possível ler secrets gravados no GitHub.
2. Configurar o secret **SOURCE_READ_TOKEN** nos quatro environments do controlador: `cloudflare-development`, `firebase-development`, `cloudflare-production`, `firebase-production`. Usar `gh secret set SOURCE_READ_TOKEN --env <nome> --repo EwertonMendes/roteiva-deploy` com entrada secreta via mecanismo seguro, sem `echo`, log ou commit do token. Conferir o escopo **Contents e Actions (read)** e expiração. O environment `source-read` já foi testado.
3. Na origem, conferir as variáveis de repositório `FIREBASE_DEV_WEB_API_KEY`, `PROD_FIREBASE_WEB_API_KEY` e `PRODUCTION_BILLING_ENABLED`, `PRODUCTION_BILLING_CHECKOUT_ENABLED`, `PRODUCTION_BILLING_PIX_ENABLED`, `PRODUCTION_BILLING_PUBLIC_ROLLOUT_ENABLED`. As flags de PROD devem ser **exatamente iguais** às já usadas em `cloudflare-production` e `firebase-production`. Nunca adivinhar ou desativar cobrança para fazer build passar.
4. Conferir que cada environment Cloudflare tem `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `API_BASE_URL`, todos com os recursos corretos. Conferir que cada environment Firebase tem os dados de WIF/OIDC e `FIREBASE_PROJECT_ID`. Valores secretos não devem sair do cofre.
5. Registrar a renovação do token fonte antes de **23/12/2026**.

## Procedimento seguro de homologação (bloqueia alteração de visibilidade até aprovação)

1. Aguardar sucesso dos três checks da master.
2. Usar `Prepare immutable DEV/PROD release package` na **origem**, modo manual, `target=dev`, `sha=<SHA atual da master>`. Confirmar upload do pacote com nome e digest esperados. Se a origem estiver privada, o job usará o runner isolado quando `ROTEIVA_CI_RUNNER=self-hosted`.
3. Executar `Verify release source` no **controlador**, com `public_probe=false`, `package_run_id=<run anterior>`, `target=dev`, `sha=<mesmo SHA>`. Exigir sucesso no download e SHA-256.
4. Executar `Verify Firebase release identity` / `firebase-release.yml` no controlador, `operation=release`, `target=development`, `sha=<mesmo SHA>`, `package_run_id=<run da origem>`. A ordem exigida é **preflight → Cloudflare/D1 → Firebase**. Só seguir após todos os jobs aprovarem.
5. Validar saúde Worker, migrações D1, regras Firestore, Firebase Hosting e login/CRUD básico de usuário de teste em DEV. Não realizar alterações em usuários reais ou pagamentos reais.
6. Validar rollback de Worker/Hosting e procedimento de falha parcial. Não desfazer automaticamente migrações D1 já aplicadas.
7. Ensaiar aprovação PROD com a proteção nativa; exigir que falha do Worker impeça o job Firebase. Depois realizar um deploy PROD **somente com autorização explícita do proprietário**, preferencialmente uma versão conhecida e sem mudança funcional.
8. Só após DEV/PROD aprovados, transferir totalmente o gatilho automático de DEV, as promoções manuais de PR e os workflows especiais (site institucional, suporte, Firestore, QA operacional) para o controlador ou equivalente seguro. Auditar os scripts/ambientes antigos.
9. Desativar os **jobs de deploy** antigos de `roteiva-web` **sem remover os jobs de teste**. Não deixá-los tentar usar environment secrets de um repositório privado no GitHub Free.
10. Rever o backup do GitHub Pages legado e as regras de visibilidade; reautorizar conectores no ChatGPT/Codex. Somente então mudar `roteiva-web` para privado na interface GitHub e testar leitura, commits, PR, logs e Actions reais.

## Restrições importantes

- O repositório público `roteiva-deploy` **não** armazena pacotes ou logs de build.
- O controlador volta a validar a origem após a aprovação protegida.
- Não usar um secret em saída de job ou artifact público para evitar configurar os environments.
- O pacote de origem expira em dois dias: gerar outro se necessário; o release não deve aceitar um pacote velho ou SHA anterior.
- O source runner local nunca recebe tokens de publicação em PROD.
- Alterar privacidade exige ação administrativa na interface do GitHub; os conectores desta sessão não oferecem ação de visibilidade.
- O caminho automático de DEV ainda não foi transferido. **Não marcar a migração como concluída nem mudar a visibilidade antes dessa transferência validada.**
