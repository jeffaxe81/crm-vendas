# Configuração Rápida indisponível por autenticação — 16/10/2026

O log fornecido pelo responsável (`Texto colado(20261017-013100).txt`) mostra
`/me/onboarding` retornando 401, assim como usuários, relatórios, integrações
e cadastros. Health retorna 200 e CORS permite `http://127.0.0.1:3000`.
Após cadastro 201, onboarding retorna 200; depois há falhas 401. Esses dados
comprovam rejeição da autenticação, não identificam sozinhos se o token expirou,
foi revogado ou sofreu outra invalidação. Não houve chamada a quick-setup no
recorte: o carregamento foi interrompido na consulta anterior de onboarding.

O front está em 127.0.0.1 e a API em localhost. O cookie de refresh usa
SameSite=Strict, e esses nomes pertencem a sites distintos. O refresh registrado
retornou 401 e não há Cookie no cabeçalho registrado. A interface só renovava
a sessão no carregamento inicial e mantinha a área autenticada após bearer 401.

## Alteração

- Em desenvolvimento local, alinhar o hostname da API ao hostname loopback do
  navegador, preservando protocolo, porta e caminho. URLs remotas e caminhos
  relativos de proxy são preservados. CORS ainda precisa autorizar a origem.
- Renovar a sessão em 80% do expiresIn informado pela API, mantendo a mesma
  organização, usuário e vínculo. Não reduzir os controles do cookie.
- Ao receber 401 de uma chamada autenticada da sessão atual, retornar ao login
  com mensagem de sessão expirada ou invalidada. Resposta antiga não encerra
  login mais recente. Não repetir automaticamente escritas ou operações.
- Falha de login não dispara encerramento de sessão por evento.

## Evidências e limites

Regressões adicionadas para URL loopback, preservação de URL remota/proxy,
notificação de 401 autenticado e ausência de notificação no login rejeitado.
**Testes não executados**, conforme orientação vigente. Sem build, deploy ou
validação no servidor nesta tarefa. A correção precisa ser integrada e aplicada;
este registro não representa encerramento operacional do incidente.

Contorno imediato para a instalação registrada: abrir o front em
`http://localhost:3000` (mesmo nome usado pela API) e entrar novamente.
Isso não substitui a correção de ciclo de sessão.
