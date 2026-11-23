# Roteiva Deploy

Controlador público de releases do Roteiva. A política e os workflows são públicos. Código, dados e artefatos de compilação ficam no repositório de origem.

- **Verify release source** confere o commit atual da master, o PR mesclado, a revisão conhecida do workflow e os três gates daquele SHA.
- **Exercise environment protection** executa somente um teste de aprovação. Selecione o destino no disparo manual. O modo production passa pelos dois gates do GitHub, em sequência.
- Os ambientes de publicação serão ligados aos provedores após homologação. As operações desta versão são somente de verificação.

O token de leitura deve ficar no ambiente source-read. Use um token fine-grained limitado a roteiva-web, com Actions, Checks, Contents e Pull requests em leitura. Confira expiração e escopo após cada renovação. A leitura anônima existe para o ensaio público e exige que o repositório ainda seja público.

O workflow de release do repositório de origem é fixado pelo ID e pelo SHA do arquivo. Quando ele mudar legitimamente, revise a mudança neste controlador antes de aceitar commits novos. Uma execução ignorada, cancelada ou de PR não é evidência do SHA final da master.

Alterações vão por PR. Execute node --test antes de atualizar a política. O controlador nunca precisa receber chaves de runtime do Worker nem material dos usuários no código, logs ou artefatos públicos.
