/*
# Atualiza status das máquinas com novos valores operacionais

1. Alterações na tabela `machines`
   - O campo `status` agora aceita 5 valores operacionais:
     - `producao`    — máquina em produção (verde)
     - `setup`       — máquina em setup/preparação (amarelo)
     - `parada`      — máquina parada (vermelho)
     - `manutencao`  — máquina em manutenção (azul)
     - `fora_turno`  — máquina fora de turno (marrom)
   - O default passa a ser `producao` (antes era `trabalhando`).

2. Migração de dados
   - Máquinas com status `trabalhando` são migradas para `producao`.
   - Os demais status (`manutencao`, `parada`) permanecem inalterados.

3. Notas
   - Nenhuma coluna foi removida; dados existentes são preservados.
   - A criticidade permanece nullable (já ajustado em migration anterior).
*/

-- Migra valores antigos para o novo padrão
UPDATE machines SET status = 'producao' WHERE status = 'trabalhando';

-- Atualiza o default para o novo valor
ALTER TABLE machines ALTER COLUMN status SET DEFAULT 'producao';
