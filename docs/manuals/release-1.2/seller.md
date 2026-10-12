# Manual do SELLER — Release 1.2

## Para quem é

O SELLER utiliza o CRM para manter relacionamento e execução comercial atualizados.

## Primeiros passos

### 1. Localizar ou cadastrar o cliente

Antes de criar um novo registro, pesquise se a empresa ou o contato já existe.

### 2. Manter contatos e canais

Registre os canais corretos de cada contato e marque o canal principal quando aplicável.

### 3. Vincular contatos e empresas

Quando um contato estiver inicialmente sem empresa, faça o vínculo assim que a relação comercial estiver confirmada.

### 4. Registrar histórico

Use o histórico para preservar contexto de ligações, e-mails, reuniões e observações relevantes.

### 5. Usar tags e campos customizados

Aplique as classificações definidas pela operação. Não crie variações desnecessárias de uma mesma tag.

## Permissões técnicas atuais

O SELLER possui atualmente:

- `company.read` / `company.write`;
- `contact.read` / `contact.write`;
- `opportunity.read` / `opportunity.write` / `opportunity.move`;
- `activity.read` / `activity.write`;
- `knowledge.read` / `knowledge.write`.

O SELLER não possui permissões administrativas de organização, usuários ou leitura de auditoria.

## Importante

O RBAC atual concede ao SELLER o mesmo conjunto técnico de permissões comerciais do MANAGER. O uso esperado, porém, é operacional: manter sua carteira e interações atualizadas conforme as regras internas da empresa.

## Boas práticas

- pesquise antes de cadastrar;
- mantenha telefone, e-mail e WhatsApp atualizados;
- registre contexto suficiente no histórico;
- use campos estruturados quando existirem em vez de esconder informações importantes em notas livres;
- não altere classificações sem necessidade;
- informe o gestor ou administrador quando identificar duplicidades ou regras inadequadas.

## Checklist rápido

- [ ] cliente correto localizado;
- [ ] contato atualizado;
- [ ] canal principal correto;
- [ ] vínculo com empresa correto;
- [ ] histórico registrado;
- [ ] tags e campos preenchidos.
