import { describe, expect, test } from "bun:test"
import {
  decideServerRestart,
  isOwnServerImage,
  parsePortOccupants,
  parseProcessImage,
  restartLocalServer,
  stopProcessByPid,
  waitFor,
  type ProcessApi,
} from "../../src/cli/server-restart"

// Echantillons de sortie reelle : le parsage doit tenir aux deux plateformes sans jamais etre devine.
const NETSTAT = [
  "  Proto  Adresse locale         Adresse distante       Etat           PID",
  "  TCP    0.0.0.0:4096           0.0.0.0:0              LISTENING       17424",
  "  TCP    127.0.0.1:4096         0.0.0.0:0              LISTENING       17424",
  "  TCP    127.0.0.1:4097         0.0.0.0:0              LISTENING       9001",
  "  TCP    0.0.0.0:52341          0.0.0.0:0              ESTABLISHED     5208",
  "  TCP    [::]:4096              [::]:0                 LISTENING       17424",
].join("\r\n")

const LSOF = ["17424", "17424"].join("\n")

describe("cli.server-restart", () => {
  test("lit le titulaire du port dans les deux formats systeme", () => {
    expect(parsePortOccupants(NETSTAT, 4096)).toEqual([17424])
    expect(parsePortOccupants(NETSTAT, 4097)).toEqual([9001])
    expect(parsePortOccupants(LSOF, 4096)).toEqual([17424])
    // Un port dont personne n'ecoute ne doit jamais designer le PID d'une autre ligne.
    expect(parsePortOccupants(NETSTAT, 4999)).toEqual([])
    expect(parsePortOccupants("", 4096)).toEqual([])
  })

  test("ne touche a rien quand les versions sont alignees", () => {
    expect(decideServerRestart({ mismatch: false, portOccupant: 17424 })).toEqual({
      action: "keep",
      reason: "versions alignées ou serveur muet",
    })
  })

  test("bascule le serveur qui tient le port quand la version differe", () => {
    expect(decideServerRestart({ mismatch: true, portOccupant: 17424, ownServer: true })).toEqual({
      action: "restart",
      pid: 17424,
    })
  })

  // Un arret sans cible unique tuerait n'importe quoi : mieux vaut laisser le port en conflit le dire.
  test("s'abstient sans titulaire de port lisible ou devant un enfant de la session", () => {
    expect(decideServerRestart({ mismatch: true }).action).toBe("keep")
    expect(decideServerRestart({ mismatch: true, portOccupant: 17424, ownServer: true, children: [17424] })).toEqual({
      action: "keep",
      reason: "le serveur a été engendré par cette session",
    })
  })

  // Un port par defaut peut etre tenu par un autre programme : on ne le tue jamais, et une image
  // illisible ne vaut pas une autorisation.
  test("ne tue jamais un programme etranger qui tient le port", () => {
    for (const ownServer of [false, undefined]) {
      const decision = decideServerRestart({ mismatch: true, portOccupant: 17424, ownServer })
      expect(decision.action).toBe("keep")
    }
  })

  test("reconnait nos propres binaires, jamais les autres", () => {
    expect(isOwnServerImage("opencodev2.exe")).toBe(true)
    expect(isOwnServerImage("opencode.exe")).toBe(true)
    // En mode source le serveur est un processus bun.
    expect(isOwnServerImage("bun.exe")).toBe(true)
    expect(parseProcessImage('"opencodev2.exe","17424","Console","1","500 000 Ko"')).toBe("opencodev2.exe")
    expect(parseProcessImage("bun\n")).toBe("bun")
    expect(parseProcessImage("")).toBeUndefined()
  })

  test("arrete gracieusement, puis force si le processus vit encore", async () => {
    const sent: Array<[number, string | number]> = []
    const api: ProcessApi = {
      send: (pid, signal) => {
        sent.push([pid, signal!])
        return true
      },
    }
    let alive = true
    await stopProcessByPid(17424, { api, alive: async () => alive, gracefulMs: 1 })
    expect(sent).toEqual([
      [17424, "SIGTERM"],
      [17424, "SIGKILL"],
    ])

    sent.length = 0
    alive = false
    await stopProcessByPid(17424, { api, alive: async () => alive, gracefulMs: 1 })
    expect(sent).toEqual([[17424, "SIGTERM"]])
  })

  test("ne signale rien sur un processus deja mort", async () => {
    const sent: Array<[number, string | number]> = []
    await stopProcessByPid(17424, {
      api: {
        send: (pid, signal) => {
          sent.push([pid, signal!])
          return false
        },
      },
      alive: async () => false,
      gracefulMs: 1,
    })
    expect(sent).toEqual([[17424, "SIGTERM"]])
  })

  test("enchaine arret, liberation du port, relance et attente de la version", async () => {
    const steps: string[] = []
    const ok = await restartLocalServer({
      pid: 17424,
      stop: async () => {
        steps.push("stop")
      },
      waitPortFree: async () => {
        steps.push("free")
        return true
      },
      spawn: () => steps.push("spawn"),
      waitVersion: async () => {
        steps.push("version")
        return "2.4.16"
      },
    })
    expect(ok).toBe(true)
    expect(steps).toEqual(["stop", "free", "spawn", "version"])
  })

  test("renonce sans lancer de serveur quand le port reste pris", async () => {
    const steps: string[] = []
    const ok = await restartLocalServer({
      pid: 17424,
      stop: async () => {
        steps.push("stop")
      },
      waitPortFree: async () => false,
      spawn: () => steps.push("spawn"),
      waitVersion: async () => {
        steps.push("version")
        return "2.4.16"
      },
    })
    expect(ok).toBe(false)
    expect(steps).toEqual(["stop"])
  })

  test("waitFor rend faux au bout du delai, vrai des que la condition tient", async () => {
    let calls = 0
    expect(
      await waitFor(async () => {
        calls += 1
        return calls >= 3
      }, 500, 1),
    ).toBe(true)
    expect(await waitFor(async () => false, 10, 1)).toBe(false)
  })
})
