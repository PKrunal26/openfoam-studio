# Classroom tutorials

Each folder is one tutorial: `tutorial.json` (parameters, tree layout, run and
result settings), `guide.md` (the walkthrough shown next to the workbench),
`case/` (OpenFOAM 13 case files used as templates) and an optional thumbnail.

How to write or change one is described in
[docs/CLASSROOM.md](../../docs/CLASSROOM.md#add-or-change-a-tutorial). After
editing, run:

```bash
npm run test:classroom
```

```bash
npm run classroom:verify
```

The cases were written for this project. They follow the problems of the
standard OpenFOAM Foundation tutorials (cavity, pitzDaily, damBreak, TJunction,
cylinder, hotRoom) so that students meet the same physics and file layout they
will find in the OpenFOAM documentation. OpenFOAM is a registered trademark of
OpenCFD Ltd; this project is not affiliated with or endorsed by the OpenFOAM
Foundation or OpenCFD.
