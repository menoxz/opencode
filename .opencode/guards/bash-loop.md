---
name: bash-loop
description: Rappelle de changer d'approche quand bash s'accumule dans un même tour
when:
  tool_calls:
    bash: ">= 12"
limits:
  min_steps_between: 5
---
Douze appels à bash dans le même tour : tu essaies probablement au hasard. Nomme l'hypothèse que tu testes, ou change d'outil.
