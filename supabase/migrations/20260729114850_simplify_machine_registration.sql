/*
# Simplifica o cadastro de máquinas

1. Alterações na tabela `machines`
   - `criticality` agora é opcional (nullable) — não é mais solicitada no formulário de cadastro.
   - `purchase_date` continua opcional (já era nullable) — não é mais solicitada no formulário.
   - `code` continua opcional — agora é gerado automaticamente quando não informado.

2. Notas
   - Nenhuma coluna foi removida, então dados existentes não são perdidos.
   - O status da máquina continua sendo controlado pela coluna `status` (trabalhando / manutencao / parada).
   - A criticidade exibida no monitor agora vem da prioridade da OS aberta vinculada à máquina.
*/

ALTER TABLE machines ALTER COLUMN criticality DROP NOT NULL;
ALTER TABLE machines ALTER COLUMN criticality SET DEFAULT 'media';
